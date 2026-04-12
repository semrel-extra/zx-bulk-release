# Migration guide v2 → v3

## TL;DR

v3 splits the release pipeline into two isolated phases — **pack** (build) and **deliver** — so that build and delivery can run with different privilege levels. Recovery is now idempotent re-delivery, not rollback.

## Breaking changes

### Two-phase pipeline

| v2 | v3 |
|----|-----|
| Single `npx zx-bulk-release` does everything | Same command still works (legacy mode) |
| — | `--pack [dir]` — build + test + write tars to `dir` (default: `parcels`) |
| — | `--deliver [dir]` — read tars from `dir` and deliver (default: `parcels`) |

If you don't use `--pack` / `--deliver`, the tool behaves as before — full pipeline in one process.

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

### Removed APIs

The following functions no longer exist:

| Removed | Reason |
|---------|--------|
| `rollbackRelease()` | No rollback in v3 |
| `teardown()` step | No rollback in v3 |
| `undo()` on channels | No rollback in v3 |
| `ghDeleteReleaseByTag()` | Was only used by undo |
| `ghUploadAssets()` | Inlined into channel |
| `deleteRemoteTag()` | Was only used by rollback |
| `fetchTags()` | Unused |
| `filterActive()` export from courier | Moved to depot internals |

### Channel contract changes

Channels now declare their credential requirements:

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
  run:  async (manifest, destDir) => { /* receives resolved manifest + unpacked dir */ },
  requires: ['token'],                     // new: credential validation
  snapshot: false,                         // new: explicit snapshot opt-in
  transport: true,                         // new: opt out with `false` (e.g. cmd channel)
}
```

Key differences:
- `run()` signature changed: receives `(manifest, destDir)` instead of `(pkg, run)`.
- `undo()` removed from all channels.
- `requires` — list of manifest fields that must resolve to non-empty values. Courier validates before delivery; missing credentials produce a warning and `skip` marker.
- `transport` — set to `false` for channels that don't go through tar delivery (like `cmd`). These run in the depot phase.

### Tar containers

Delivery artifacts are now self-describing tar archives:

```
parcel.{tag}.{channel}.{timestamp}.{sha7}.{hash6}.tar
  manifest.json    — channel, params, ${{ENV_VAR}} templates
  package.tgz     — (npm) npm tarball
  assets/          — (gh-release) release assets
  docs/            — (gh-pages) documentation
```

The filename now includes commit timestamp (`20260412t095200z`) and short SHA (7 hex) for artifact seniority tracking.

After delivery, each tar is overwritten with a text marker:
- `released` — successfully delivered
- `skip` — skipped (missing credentials)

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
      - run: npx zx-bulk-release
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### v3 (two jobs, isolated credentials)
```yaml
jobs:
  pack:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: npx zx-bulk-release --pack
      - uses: actions/upload-artifact@v4
        with:
          name: parcels
          path: parcels
          retention-days: 1
          if-no-files-found: ignore

  deliver:
    needs: pack
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        id: download
        with: { name: parcels, path: parcels }
        continue-on-error: true
      - if: steps.download.outcome == 'success'
        run: npx zx-bulk-release --deliver
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          GIT_COMMITTER_NAME: Semrel Extra Bot
          GIT_COMMITTER_EMAIL: semrel-extra-bot@hotmail.com
      - if: steps.download.outcome == 'success'
        uses: actions/upload-artifact@v4
        with: { name: parcels, path: parcels, overwrite: true, retention-days: 1 }
```

The final `upload-artifact` syncs markers back, so re-running the deliver job skips already-delivered parcels.

**The single-job workflow still works.** Two-phase is opt-in.

## Checklist

- [ ] Remove `--recover` from scripts — use `--deliver` instead
- [ ] Remove any custom `undo()` logic from channel plugins
- [ ] If using custom channels: update `run()` signature to `(manifest, destDir)`, add `requires` field
- [ ] Optionally: split CI into pack + deliver jobs for credential isolation
- [ ] If using two-phase: ensure `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL` are set in deliver env (defaults apply if unset)
- [ ] Remove references to `teardown`, `rollbackRelease`, `ghDeleteReleaseByTag`
