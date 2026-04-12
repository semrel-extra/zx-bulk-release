# Supply chain security model

## Why this matters

A monorepo release tool runs `npm install`, then executes arbitrary build and test commands — all with access to the CI runner's filesystem. Any compromised dependency can:

- **Steal secrets.** `GH_TOKEN`, `NPM_TOKEN`, signing keys — anything in the environment.
- **Inject code.** Modify build output, tamper with npm tarballs, add postinstall scripts.
- **Hijack delivery.** Push malicious packages to registries, create fake releases, overwrite git tags.
- **Persist.** Modify CI configs, add webhooks, create backdoor tokens.

Traditional release tools run everything in a single process with full credentials. One compromised transitive dep = full supply chain compromise. This is not hypothetical — [event-stream](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident), [ua-parser-js](https://github.com/nicest-humanity/ua-parser-js-compromised), [colors/faker](https://snyk.io/blog/open-source-npm-packages-colors-702/faker), [codecov](https://about.codecov.io/security-update/) demonstrate this pattern repeatedly.

## Threat model

| Threat | Vector | Impact |
|--------|--------|--------|
| Credential theft | Hostile dep reads `process.env` or `~/.npmrc` | Attacker publishes to npm/GitHub with stolen tokens |
| Parcel injection | Hostile code writes extra tars to parcels dir | Deliver publishes attacker's packages |
| Directive tampering | Hostile code modifies directive manifest | Delivery order/targets altered, parcels swapped |
| Tarball replacement | Hostile code overwrites npm tarball inside parcel | Users install compromised package |
| Context mutation | Hostile code modifies receive context after analysis | Wrong versions, wrong tags, wrong expectations |

## Architectural response

### Phase isolation

The pipeline is split into phases with strict trust boundaries:

```
┌─────────────────────────────────────────────────┐
│  build job (untrusted after yarn install)        │
│                                                  │
│  1. checkout                                     │
│  2. zbr --receive        ← GH_TOKEN (safe,      │
│  3. upload context       ← before deps)          │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  4. yarn install         ← TRUST BOUNDARY        │
│  5. zbr --pack           ← zero creds            │
│  6. upload parcels       ← untrusted output      │
└─────────────────────────────────────────────────┘
                    ↓ artifacts
┌─────────────────────────────────────────────────┐
│  deliver job (trusted, clean runner)             │
│                                                  │
│  1. download context     ← trusted (pre-deps)    │
│  2. download parcels     ← untrusted             │
│  3. zbr --deliver        ← verify + deliver      │
│     verify parcels against trusted context        │
│     then deliver                                  │
│                          ← GH_TOKEN, NPM_TOKEN   │
└─────────────────────────────────────────────────┘
```

### What each boundary prevents

**Trust boundary 1: receive before deps.**
`zbr --receive` runs before `yarn install`. It uses `GH_TOKEN` to consume rebuild signals and performs analysis (version resolution, preflight). The context is uploaded as a CI artifact immediately — before any third-party code executes. Hostile deps never see the token, and cannot mutate the context after upload.

**Trust boundary 2: job isolation.**
Build and deliver run on separate CI runners. They share nothing except explicitly uploaded artifacts. Even if the build runner is fully compromised — background processes, modified binaries, tampered filesystem — the deliver runner starts clean.

**Trust boundary 3: verification.**
The deliver job receives two artifacts from different trust levels:
- **Context** (trusted) — uploaded before deps, contains expected packages, versions, tags, channels.
- **Parcels** (untrusted) — produced in compromised environment.

`zbr --verify parcels-unverified/` validates untrusted parcels against the trusted context and copies only verified parcels to `parcels/`. Deliver then reads only from `parcels/`. Verification checks:
- sha7 prefix matches the context
- Each parcel's channel is expected for its package
- Each parcel's tag belongs to a known package
- No injected parcels (files not matching any expected package are rejected)
- Directive sha matches the context

### Credential flow

```
receive (pre-deps):    GH_TOKEN → consume signal, read remote tags
pack (post-deps):      zero credentials — manifests use ${{ENV_VAR}} templates
deliver (clean job):   GH_TOKEN + NPM_TOKEN → resolve templates, push tags, publish
```

Credentials never coexist with third-party code. The build phase cannot leak tokens because it never has them. Template placeholders (`${{NPM_TOKEN}}`) are inert strings until resolved by the courier on a clean runner.

### What this does NOT protect against

- **Tarball content tampering.** A hostile dep can modify the compiled output inside an npm tarball. Detecting this requires reproducible builds, which is outside zbr's scope.
- **Source code manipulation.** If the checkout itself is compromised (e.g., a malicious PR merged), the entire pipeline runs attacker code. This is a git/review-process concern.
- **CI platform compromise.** If GitHub Actions itself is compromised, all bets are off.
- **zbr binary tampering.** `npx zx-bulk-release` fetches zbr from npm. If zbr itself is compromised, the pipeline is compromised. Pinning versions and using lockfiles mitigates this.

### Rebuild signal protocol

When a version conflict is detected during delivery, zbr pushes a `zbr-rebuild.{sha7}` tag to trigger a new CI run. The new run's receive phase attempts to delete this tag:

- **Delete succeeds** — this process owns the rebuild. Proceed.
- **Delete fails** (tag already gone) — another process claimed it. Early exit, no wasted work.

This is the same atomic CAS pattern used for delivery semaphores, applied to CI coordination. The tag deletion is the mutex — first to delete wins.

## Pipeline modes and security trade-offs

zbr supports three pipeline modes with increasing security guarantees:

| Mode | Phases | Credential isolation | Context verification | Supply chain protection |
|------|--------|---------------------|---------------------|------------------------|
| All-in-one | 1 | None | None | None |
| Two-phase | `--pack` + `--deliver` | Build vs delivery | None | Partial |
| Four-phase | `--receive` + `--pack` + `--verify` + `--deliver` | Full | Yes | Full |

The **two-phase** mode isolates credentials (pack has no secrets), but third-party code runs in the same environment as analysis. A compromised dep could influence version resolution or inject parcels.

The **four-phase** mode adds two boundaries: `--receive` runs before deps install (safe analysis), and `--verify` validates parcels against the trusted context on a clean runner.

This document describes the four-phase model. For simpler setups, see [README.md](./README.md#pipeline-modes).

## CI workflow reference (four-phase)

```yaml
name: release

on:
  push:
    branches: [master]
    tags: ['zbr-rebuild.*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      # Phase 1: receive — BEFORE deps install
      - run: npx zx-bulk-release --receive
        id: receive
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}

      # Context uploaded BEFORE yarn install — trust anchor
      - uses: actions/upload-artifact@v4
        with:
          name: context-${{ github.run_id }}
          path: .zbr-context.json

      # Phase 2: pack — zero credentials
      - if: steps.receive.outputs.status == 'proceed'
        run: |
          yarn install
          npx zx-bulk-release --pack

      - if: steps.receive.outputs.status == 'proceed'
        uses: actions/upload-artifact@v4
        with:
          name: parcels-${{ github.run_id }}
          path: parcels/

  deliver:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: context-${{ github.run_id }}
          path: .
      - uses: actions/download-artifact@v4
        with:
          name: parcels-${{ github.run_id }}
          path: parcels-unverified/

      # Phase 3: verify — validate against trusted context
      - run: npx zx-bulk-release --verify parcels-unverified/

      # Phase 4: deliver — only verified parcels
      - run: npx zx-bulk-release --deliver
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          GIT_COMMITTER_NAME: Semrel Extra Bot
          GIT_COMMITTER_EMAIL: semrel-extra-bot@hotmail.com
```

## Summary

| Concern | Mitigation |
|---------|------------|
| Credential theft | Pack phase has zero secrets; receive runs before deps |
| Parcel injection | Verify against trusted context on clean runner |
| Directive tampering | Context uploaded before deps; parcels verified against it |
| Context mutation | Uploaded as artifact before `yarn install` |
| Concurrent delivery races | Git-tag-based semaphores (atomic push = ownership) |
| Version conflicts | Self-resolving via rebuild signal + preflight re-resolution |
| Zombie locks | CI job timeout + timestamp-based stale lock detection |
