# Migration guide v2 → v3

## TL;DR

v3 introduces a flexible pipeline with three deployment schemes:
- **All-in-one** — single command, same as v2 (no changes needed)
- **Two phases** — `--pack` + `--deliver` with credential isolation between jobs
- **Four phases** — `--receive` + `--pack` + `--verify` + `--deliver` with strict supply chain security boundaries

Recovery is now idempotent re-delivery, not rollback. Multiple release agents can safely serve the same monorepo concurrently via git-tag-based coordination.

## Breaking changes

### Pipeline modes

| v2 | v3 |
|----|-----|
| Single `npx zx-bulk-release` does everything | Same command still works (all-in-one) |
| — | `--pack [dir]` + `--deliver [dir]` — two-phase with credential isolation |
| — | `--receive` + `--pack` + `--verify` + `--deliver` — four-phase with supply chain security |

Without phase flags, the tool runs all phases in one process (all-in-one mode).

**New flags in v3:**

| Flag | Description |
|------|-------------|
| `--receive` | Consume rebuild signal, analyze, preflight, write `zbr-context.json`. Run *before* deps install. |
| `--pack [dir]` | Build, test, write delivery tars to `dir`. No credentials needed. |
| `--verify [dir]` | Validate untrusted parcels against trusted context, copy valid ones to `parcels/`. |
| `--context <path>` | Path to trusted `zbr-context.json` (used with `--verify`). |
| `--deliver [dir]` | Read tars from `dir` and deliver. No source code needed. |

### Recovery replaces rollback

| v2 | v3 |
|----|-----|
| `--recover` — deletes orphan git tags | Re-run `--deliver` — delivers only undelivered parcels |
| `undo()` on each channel (delete release, remove tag, etc.) | No undo. Delivered tars are marked `released` and skipped on re-run |
| `teardown` step after failure | Removed entirely |

**Action:** remove any `--recover` usage from scripts and CI. Replace with `--deliver`.

### Credential isolation

v2 required all credentials (GH_TOKEN, NPM_TOKEN) at build time. v3 separates concerns:

- **Pack phase** (`--pack`): needs source code and build tools. **No secrets required.** Git tag push is no longer done here — it's a delivery channel now.
- **Deliver phase** (`--deliver`): needs only delivery credentials (`GH_TOKEN`, `NPM_TOKEN`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`). No source code required.

Credentials are stored as `${{ENV_VAR}}` templates in tar manifests and resolved at delivery time.

### Git tag push moved to courier

v2/v3-early pushed git tags during the `publish` step (build phase). Now `git-tag` is a regular courier channel — the tag is pushed during delivery, alongside npm publish and gh-release. This means:
- Pack phase needs zero credentials
- `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` are resolved at delivery time
- The `git-tag` channel runs first, before other channels that depend on the tag (e.g. `gh-release`)

### Preflight check

v3 adds a preflight step between `analyze` and `build`. It checks tag availability on git remote before wasting build/test time:
- Tag free → proceed
- Tag exists, same commit → skip (already released)
- Tag exists, our commit is older → skip
- Tag exists, our commit is newer → re-resolve to a new version
- Diverged commits → skip

This eliminates most version conflicts before they reach the delivery phase.

### Coordinated delivery

v3 introduces directive-based coordination for concurrent release agents:
- A **directive** meta-parcel lists all packages, their delivery steps, and their parcel filenames
- **Semaphore tags** (`zbr-deliver.{sha7}`) lock delivery per commit — atomic git push = ownership
- **Orphan invalidation** cleans up stale parcels from previous builds of the same commit
- **Rebuild signals** (`zbr-rebuild.{sha7}`) trigger CI when version conflicts are detected
- **Docs seniority** prevents older versions from overwriting newer docs

See [DELIVER_SPEC.md](./DELIVER_SPEC.md) for the full protocol specification.

### Removed APIs

The following functions no longer exist:

| Removed | Reason |
|---------|--------|
| `rollbackRelease()` | No rollback in v3 |
| `teardown()` step | No rollback in v3 |
| `undo()` on channels | No rollback in v3 |
| `ghDeleteReleaseByTag()` | Was only used by undo |
| `ghUploadAssets()` | Inlined into channel |
| `fetchTags()` | Unused |
| `filterActive()` export from courier | Moved to depot internals |

### Channel contract changes

Channels now declare their credential requirements and return delivery status:

```js
// v2
export default {
  name: 'npm',
  when: (pkg) => !pkg.manifest.private,
  run:  async (pkg, run) => { /* ... */ },
  undo: async (pkg) => { /* ... */ },     // removed
}

// v3
export default {
  name: 'npm',
  when: (pkg) => !pkg.manifest.private,
  run:  async (manifest, destDir) => { /* returns 'ok' | 'duplicate' | 'conflict' */ },
  requires: ['token'],                     // new: credential validation
  snapshot: false,                         // new: explicit snapshot opt-in
  transport: true,                         // new: opt out with `false` (e.g. cmd channel)
}
```

Key differences:
- `run()` signature changed: receives `(manifest, destDir)` instead of `(pkg, run)`.
- `run()` returns a status string: `ok`, `duplicate` (already published), or `conflict` (version collision).
- `undo()` removed from all channels.
- `requires` — list of manifest fields that must resolve to non-empty values. Courier validates before delivery; missing credentials produce a warning and `skip` marker.
- `transport` — set to `false` for channels that don't go through tar delivery (like `cmd`). These run in the depot phase.

### Tar containers

Delivery artifacts are now self-describing tar archives:

```
parcel.{sha7}.{channel}.{tag}.{hash6}.tar
  manifest.json    — channel, params, ${{ENV_VAR}} templates
  package.tgz     — (npm) npm tarball
  assets/          — (gh-release) release assets
  docs/            — (gh-pages) documentation
```

The `sha7` prefix groups all parcels of one commit. The `hash6` suffix is a content hash for deduplication.

A **directive** meta-parcel (`parcel.{sha7}.directive.{ts}.tar`) is generated alongside regular parcels, containing the complete delivery map for coordinated delivery.

After delivery, each tar is overwritten with a text marker:
- `released` — successfully delivered
- `skip` — skipped (missing credentials)
- `conflict` — version collision, needs rebuild
- `orphan` — stale parcel not owned by current directive

Broken or foreign files in the parcels directory are logged but never modified.

## CI workflow migration

### v2 (single job)
```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: yarn install
      - run: npx zx-bulk-release
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### v3 — all-in-one (same as v2)

No changes required. The single-command workflow still works.

### v3 — two phases: pack + deliver

Credential isolation: pack has no secrets, deliver has no source code.

```yaml
jobs:
  pack:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: yarn install
      - run: npx zx-bulk-release --pack
      - uses: actions/upload-artifact@v4
        with:
          name: parcels-${{ github.run_id }}
          path: parcels/
          retention-days: 1
          if-no-files-found: ignore

  deliver:
    needs: pack
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        id: download
        with:
          name: parcels-${{ github.run_id }}
          path: parcels/
        continue-on-error: true
      - if: steps.download.outcome == 'success'
        run: npx zx-bulk-release --deliver
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          GIT_COMMITTER_NAME: Semrel Extra Bot
          GIT_COMMITTER_EMAIL: semrel-extra-bot@hotmail.com
```

### v3 — four phases: receive + pack + verify + deliver

Maximum supply chain security. Receive runs before deps install (trust anchor), pack runs with zero credentials, verify validates untrusted parcels, deliver handles only verified artifacts. See [SECURITY.md](./SECURITY.md).

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

      # Context uploaded before any third-party code
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
      - run: npx zx-bulk-release --verify parcels-unverified/

      # Phase 4: deliver — only verified parcels
      - run: npx zx-bulk-release --deliver
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          GIT_COMMITTER_NAME: Semrel Extra Bot
          GIT_COMMITTER_EMAIL: semrel-extra-bot@hotmail.com
```

The `zbr-rebuild.*` tag trigger enables automatic conflict resolution: when a version conflict is detected during delivery, zbr pushes a rebuild signal tag, which triggers a fresh CI run with re-resolved versions.

## Checklist

- [ ] Remove `--recover` from scripts — use `--deliver` instead
- [ ] Remove any custom `undo()` logic from channel plugins
- [ ] If using custom channels: update `run()` signature to `(manifest, destDir)`, add `requires` field, return `'ok'` / `'duplicate'` / `'conflict'`
- [ ] Remove references to `teardown`, `rollbackRelease`, `ghDeleteReleaseByTag`
- [ ] Choose a pipeline mode:
  - **All-in-one** — no changes needed, single command works as before
  - **Two phases** — split CI into `--pack` + `--deliver` jobs for credential isolation
  - **Four phases** — add `--receive` before deps install, `--verify` before delivery for supply chain security
- [ ] If splitting phases: ensure `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL` are set in deliver env
- [ ] Optionally: add `zbr-rebuild.*` tag trigger for automatic conflict resolution (four phases)
