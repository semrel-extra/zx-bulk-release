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
+-----------------------------------------------------+
|  build job (untrusted after yarn install)           |
|                                                     |
|  1. checkout                                        |
|  2. zbr --receive         <- GH_TOKEN (safe,        |
|  3. upload context           before deps)           |
|  - - - - - - - - - - - - - - - - - - - - - - - -    |
|  4. yarn install          <- TRUST BOUNDARY         |
|  5. zbr --pack            <- zero creds             |
|  6. upload parcels        <- untrusted output       |
+-----------------------------------------------------+
                       v artifacts
+-----------------------------------------------------+
|  deliver job (trusted, clean runner)                |
|                                                     |
|  1. download context      <- trusted (pre-deps)     |
|  2. download parcels      <- untrusted              |
|  3. zbr --verify          <- parcels vs context     |
|  4. zbr --deliver         <- GH_TOKEN, NPM_TOKEN    |
+-----------------------------------------------------+
```

### What each boundary prevents

**Trust boundary 1: receive before deps.**
`zbr --receive` runs before `yarn install`. It uses `GH_TOKEN` to consume rebuild signals and performs analysis (version resolution, preflight). The context is uploaded as a CI artifact immediately — before any third-party code executes. Hostile deps never see the token, and cannot mutate the context after upload.

**Trust boundary 2: job isolation.**
Build and deliver run on separate CI runners. They share nothing except explicitly uploaded artifacts. Even if the build runner is fully compromised — background processes, modified binaries, tampered filesystem — the deliver runner starts clean.

**Trust boundary 3: verification.**
The deliver job receives two artifacts from different trust levels:
- **Context** (trusted) — uploaded before deps, contains the commit, its time, whether npm publishes a snapshot, and the expected packages with their versions, tags, channels, `populate` rules and dependencies.
- **Parcels** (untrusted) — produced in compromised environment.

`zbr --verify parcels-unverified/:parcels/` validates untrusted parcels against the trusted context and copies only verified parcels to `parcels/`. Deliver then reads only from `parcels/`. Verification checks:
- sha7 prefix matches the context; file names hold only the characters pack writes (no log injection), and links are refused
- Each parcel's channel is expected for its package
- No injected parcels (files not matching any expected package are rejected), and nothing unverified already waits in `parcels/`
- Each manifest's `channel` matches the parcel name
- Each manifest keeps the package name and version of its parcel, the commit (`sha`), the `populate` rules and the release `tag` from the context
- The npm tarball inside a parcel (`package.tgz`) is the package the parcel is named for: npm publishes under the name and version from its `package.json`, read the way npm reads it — a second, differently spelled `package.json` makes the tarball ambiguous and rejected
- The npm dist-tag matches the context: a snapshot can't go out as `latest`
- There is one directive, named for the commit time, with the commit and time of the context (deliveries are ordered by it)
- The directive lists only context packages with their versions and tags, one verified parcel of the package per context channel, every dependency the context knows and no cycles. It may hold packages back (phases run with different flags); verify names them
- Markers are only where a courier leaves them: a directive marked delivered has no parcels left, a listed parcel is never an orphan, and nothing of a package is marked delivered before its claim

Verification needs no credentials. The courier checks the resolved manifests against their `populate` rules right before delivery (see [Populate rules](../README.md#populate-rules)).

**What the courier enforces itself.** Whatever the parcels: nothing of a package goes out until its claim — the `git-tag` parcel, which every release but a snapshot has — is ours (claim before act), and who owns a tag is read from the remote. With a directive, a marker on a claim counts only for what the remote says. Parcels are unpacked as plain files inside a fresh directory: links and paths leading out of it are refused. Deliver needs push access for tags and service branches (`GH_TOKEN` with `contents: write`).

### Credential flow

```
receive (pre-deps):    GH_TOKEN → consume signal, read remote tags
pack (post-deps):      zero credentials — manifests use ${{ENV_VAR}} templates
verify (clean job):    zero credentials — check parcels against the trusted context
deliver (clean job):   GH_TOKEN + NPM_TOKEN → resolve templates, check populate rules, push tags, publish
```

Credentials never coexist with third-party code. The build phase cannot leak tokens because it never has them. Template placeholders (`${{NPM_TOKEN}}`) are inert strings until resolved by the courier on a clean runner. The courier resolves placeholders in any manifest field, so a placeholder smuggled into data (e.g. a commit message that ends up in release notes) is resolved too. `populate` schemas constrain what resolved fields may look like — where credentials go and what endpoints they are sent to — but a free-text field such as release notes can't tell a substituted secret from ordinary text.

### What this does NOT protect against

- **Tarball content tampering.** A hostile dep can modify the compiled output inside an npm tarball. Verify makes sure the tarball is the expected package and version, but detecting changed contents requires reproducible builds, which is outside zbr's scope.
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

The **two-phase** mode isolates credentials (pack has no secrets), but third-party code runs in the same environment as analysis. A compromised dep could influence version resolution or inject parcels. Without verify nothing binds the parcels to a trusted context: the pack decides which commit a claim points at and which parcels a directive lists. The courier still claims before it acts, but the pack picks the claims, and can leave them out.

The **four-phase** mode adds two boundaries: `--receive` runs before deps install (safe analysis), and `--verify` validates parcels against the trusted context on a clean runner.

This document describes the four-phase model. For simpler setups, see [README.md](../README.md#pipeline-modes).

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
          path: zbr-context.json

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
      - run: npx zx-bulk-release --verify parcels-unverified/:parcels/

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
| Version races | Claim before act; who owns a tag is read from the remote |
| Version conflicts | Self-resolving via rebuild signal + preflight re-resolution |
| Lying markers | With a directive, claim markers are confirmed on the remote; verify accepts markers only where a courier leaves them |
| Hostile tar entries | Plain files only, unpacked inside a fresh directory |
| Zombie locks | Removed by hand (or by a cleanup step you add); until then deliver skips that commit |
