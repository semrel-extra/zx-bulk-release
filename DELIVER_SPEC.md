# Deliver: coordinated delivery specification

## Problem

Multiple zbr processes may concurrently build and deliver artifacts for overlapping packages from different (or the same) commits. Without coordination:
- Tag races — two processes push the same tag
- Docs overwritten — older version overwrites newer
- Duplicate registry publishes
- Invalid deliveries — parcels built for a version whose tag is already claimed by another SHA

## Principles

1. **Credential isolation.** The pack phase has zero secrets. All credentials (`GH_TOKEN`, `NPM_TOKEN`, `GIT_COMMITTER_*`) exist only in deliver. Manifests contain `${{ENV_VAR}}` placeholders resolved at delivery time. Tars can be stored, transferred, and inspected without leak risk.
2. **Git tag push as the sole coordination primitive.** Atomic, cross-platform, requires no external services. Push success = ownership, `already exists` = rejection.
3. **Annotated tag body as data envelope.** Mutex and payload in one mechanism.
4. **Build as transactional unit.** All parcels of one build are delivered by a single process. Splitting across processes breaks integrity guarantees.
5. **Parcels are preserved until resolved.** Skipped parcels (missing credentials) remain valid tarballs for later re-delivery. Delivered and conflicted parcels are overwritten with a status marker.
6. **Conflicts are self-resolving.** Each rebuild sees fresh tags and gets a new version. Infinite loops are impossible.

## Artifacts

### Parcel

A tar archive containing the manifest and files for one channel of one package.

```
parcel.{sha7}.{channel}.{tag}.{hash6}.tar
```

- `sha7` — first 7 characters of the commit SHA
- `channel` — delivery channel (`git-tag`, `npm`, `gh-release`, ...)
- `tag` — semantic release tag (human-readable, informational)
- `hash6` — 6-character SHA-1 of tar contents (content-addressable dedup)

The manifest inside the tar contains `${{ENV_VAR}}` placeholders resolved at delivery time via `resolveManifest()`.

### Directive

A meta-parcel describing the complete delivery map of one build.

```
parcel.{sha7}.directive.{ts}.tar
```

- `sha7` — first 7 characters of the commit SHA (same as parcels)
- `ts` — epoch timestamp of the commit (seconds); used to order directives oldest-first

Manifest:

```json
{
  "channel": "directive",
  "sha": "abc1234567890",
  "timestamp": 1718000000,
  "queue": ["a", "b", "c"],
  "parcels": [
    "parcel.abc1234.npm.2026.4.12-a.1.0.1-f0.f0e1d2.tar",
    "parcel.abc1234.git-tag.2026.4.12-a.1.0.1-f0.a1b2c3.tar"
  ],
  "packages": {
    "a": {
      "version": "1.0.1",
      "tag": "2026.4.12-a.1.0.1-f0",
      "deliver": [
        ["git-tag", "gh-release", "changelog", "gh-pages", "meta"],
        ["npm"]
      ],
      "parcels": [
        "parcel.abc1234.git-tag.2026.4.12-a.1.0.1-f0.a1b2c3.tar",
        "parcel.abc1234.npm.2026.4.12-a.1.0.1-f0.f0e1d2.tar"
      ]
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `sha` | Full commit SHA of the build |
| `timestamp` | Epoch timestamp of the commit (seconds) |
| `queue` | Packages in topo-sorted dependency order |
| `parcels` | Complete list of parcel filenames owned by this directive |
| `packages[name].deliver` | Array of steps. Channels within a step run in parallel. Steps run sequentially |
| `packages[name].parcels` | Parcel filenames belonging to this package |

#### Channel ordering within steps

**Step 1** — everything targeting git remote (single token, single remote):
- `git-tag` — always first, acts as the version gate/lock
- `gh-release` — depends on the tag
- `changelog`, `gh-pages`, `meta` — commits to service branches

**Step 2** — external registries (different credentials, different infra):
- `npm`, `jsr`, `cmd`

Pack builds steps based on the package configuration. `defaultOrder` in code is the fallback for builds without a directive.

#### Orphan invalidation

The directive holds the authoritative `parcels[]` list. On delivery, all files matching `parcel.{sha7}.*.tar` that are NOT in this list are overwritten with `orphan`. This cleans up stale parcels from previous non-deterministic builds of the same commit (different content hash → different filename → both exist, but only the directive's set is valid).

## Semaphores

Two tag types:

| Tag | Type | Purpose | Lifetime |
|-----|------|---------|----------|
| `zbr-deliver.{sha7}` | annotated | Lock build delivery to one process | Duration of delivery |
| `zbr-rebuild.{sha7}` | annotated | Signal CI to rebuild | Until rebuild process starts |

### Delivery lock

```
zbr-deliver.{sha7}
```

Annotated tag body:

```json
{
  "ts": 1718000000,
  "sha": "abc1234567890",
  "packages": ["a", "b", "c"]
}
```

- **Acquire:** `git tag -a zbr-deliver.{sha7} -m <body> && git push origin zbr-deliver.{sha7}` — atomic
- **Release:** `git push origin :refs/tags/zbr-deliver.{sha7}` — in `finally`, on any outcome
- **Check:** `git ls-remote --tags origin 'zbr-deliver.*'`

### Zombie lock

Process crashed without releasing the lock. Protection: CI job timeout + `post:` step in workflow that releases the lock. Additionally, deliver on startup can check stale locks by timestamp and force-delete them.

### Rebuild signal

```
zbr-rebuild.{sha7}
```

CI trigger:

```yaml
on:
  push:
    tags: ['zbr-rebuild.*']
```

The new zbr process on startup:
1. Deletes `zbr-rebuild.{sha7}` (consumes the signal)
2. Runs a full pack cycle with preflight

## Delivery protocol

### deliver — main loop

```
deliver(parcelsDir, env):
  directives = scanDirectives(parcelsDir)
                  .sort(by timestamp asc)        // oldest first

  tarMap = Map(basename → fullPath)              // all tars in dir

  for directive of directives:
    locked = tryLock(zbr-deliver.{sha7})
    if !locked → continue                        // another process is working

    try:
      invalidateOrphans(dir, directive)           // mark stale parcels
      conflicts = []

      for pkgName of directive.queue:
        pkg = directive.packages[pkgName]

        for step of pkg.deliver:                 // steps sequentially
          results = await parallel(step, ch =>   // channels in step parallel
            deliverParcel(tarMap, pkg, ch, env)
          )

          if results.has('conflict'):
            markConflict(pkg.parcels)             // all package parcels → "conflict"
            conflicts.push(pkgName)
            break                                 // remaining steps skipped

    finally:
      unlock(zbr-deliver.{sha7})                 // release lock

      if conflicts.length:
        pushTag(zbr-rebuild.{sha7})              // signal CI
        markDirective(directive, 'conflict')
      else if allDelivered(directive):
        markDirective(directive, 'released')
      // otherwise — skips remain, directive stays valid
```

### deliverParcel — single channel delivery

```
deliverParcel(tarMap, pkg, channelName, env):
  parcelName = pkg.parcels.find(includes channelName)
  tarPath = tarMap.get(parcelName)
  if !tarPath → return 'missing'

  content = read(tarPath)
  if content in {released, skip, conflict, orphan} → return 'already'

  manifest = unpackAndResolve(tarPath, env)
  channel  = channels[channelName]

  missing = channel.requires.filter(f → !manifest[f])
  if missing.length → return 'skip'               // parcel untouched

  result = await channel.run(manifest, destDir)

  if result == 'conflict' → return 'conflict'      // handled at package level
  if result == 'duplicate':
    write(tarPath, 'released')                     // goal achieved by another path
    return 'duplicate'

  write(tarPath, 'released')
  return 'ok'
```

### Parcel markers

| State | Tar file | Action |
|-------|----------|--------|
| Delivered | Overwritten with `released` | Subsequent deliver skips |
| Conflict | Overwritten with `conflict` | Will be rebuilt |
| Skipped (no creds) | Untouched | Valid tarball, delivered later |
| Duplicate (`already exists` in registry) | Overwritten with `released` | Goal achieved by another path |
| Orphan (not in directive) | Overwritten with `orphan` | Stale parcel from previous build |

### Channel error classification

| Channel | `already exists` | Semantics |
|---------|-------------------|-----------|
| `git-tag` | `conflict` | Possible version conflict, needs reconcile |
| `npm` | `duplicate` | Someone delivered first, goal achieved |
| `gh-release` | `duplicate` | Same |
| `gh-pages` | No delta → no commit | OK, docs are current |
| `changelog` | No delta → no commit | OK |
| `meta` | No delta → no commit | OK |

### Docs seniority protection

Channels `gh-pages`, `changelog`, and `meta` check before committing: does a remote tag for a higher version of the same package exist? If so, skip — our docs are outdated.

```
remoteTags = git ls-remote --tags origin
higherExists = remoteTags.has(tag for same pkg with version > ours)
if higherExists → skip (do not commit)
```

## Scenarios

### 1. Single process, normal delivery

```
zbr pack → directive + parcels
zbr deliver:
  lock directive → success
  a: git-tag → ok, gh-release → ok, npm → ok
  b: git-tag → ok, npm → ok
  unlock
  directive → "released"
```

### 2. Two processes, different commits, different packages

```
process 1: lock sha=aaa → ok → deliver a → unlock
process 2: lock sha=bbb → ok → deliver b → unlock
           parallel, no interference
```

### 3. Two processes, version conflict

```
process 1: lock sha=aaa → ok
           a: git-tag a@1.0.1 → success → deliver rest
           unlock

process 2: lock sha=bbb → ok
           a: git-tag a@1.0.1 → conflict!
           → all parcels of a → "conflict"
           b: git-tag b@2.0.0 → success → deliver rest
           unlock
           push zbr-rebuild.bbb → CI triggers

process 3 (rebuild):
           delete zbr-rebuild.bbb
           pack: preflight → a@1.0.1 tag taken → re-resolve → a@1.0.2
           deliver: a@1.0.2 → success
```

### 4. Two processes, same commit

```
process 1: lock sha=aaa → ok → deliver → unlock
process 2: lock sha=aaa → fail (tag exists) → skip

           if process 1 finishes first, process 2 sees "released" markers
           if process 1 crashes, zombie lock cleanup lets process 2 retry
```

### 5. Partial delivery (missing credentials)

```
process 1 (GH_TOKEN only):
  lock directive → ok
  a: git-tag → ok, gh-release → ok
  a: npm → skip (no NPM_TOKEN), parcel untouched
  unlock
  directive stays valid (has skips)

process 2 (NPM_TOKEN):
  lock directive → ok (lock was released)
  a: git-tag → "released" → skip
  a: npm → deliver → ok
  unlock
  directive → "released"
```

### 6. Multiple directives, oldest first

```
parcelsDir/
  parcel.abc1234.directive.100.tar    (ts=100)
  parcel.abc1234.npm.*.tar
  parcel.def5678.directive.200.tar    (ts=200)
  parcel.def5678.npm.*.tar

deliver:
  directive ts=100: lock → deliver → unlock
  directive ts=200: lock → deliver → unlock
  sequential, oldest first
```

### 7. Non-deterministic rebuild (orphan cleanup)

```
build 1: produces parcel.abc1234.npm.pkg-v1.0.1.aaa111.tar
build 2: produces parcel.abc1234.npm.pkg-v1.0.1.bbb222.tar
         overwrites directive (same filename, last-writer-wins)

deliver:
  reads directive → parcels list has bbb222
  invalidateOrphans → aaa111 not in list → marked "orphan"
  delivers only bbb222
```

## Preflight

Between `analyze` and `build` — checks tag availability on remote. Eliminates conflicts before building, saves build/test time.

```
preflight(pkg):
  tag = pkg.tag
  remoteSha = git ls-remote --tags origin refs/tags/{tag}

  if !remoteSha → ok, tag is free

  if remoteSha == ctx.git.sha → skip (duplicate, this commit already processed)

  git fetch --deepen=100 (if shallow)

  if ours is ancestor of remote → skip (we are older)
  if remote is ancestor of ours → re-resolve:
    git fetch origin --tags --force
    clearTagsCache()
    resolvePkgVersion() → new version, new tag
  if diverged → skip (anomaly)
```

Decisions are per-package. A conflict on `b` does not block `a`.

## CI integration

zbr supports three pipeline modes. Choose the one that fits your security requirements.

### All-in-one

Single command runs all phases in one process. No coordination, no supply chain protection.

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

### Two phases: pack + deliver

Credential isolation between build and delivery. Pack phase has zero secrets.

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
          if-no-files-found: ignore

  deliver:
    needs: pack
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: parcels-${{ github.run_id }}
          path: parcels/
        continue-on-error: true
      - run: npx zx-bulk-release --deliver
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          GIT_COMMITTER_NAME: Semrel Extra Bot
          GIT_COMMITTER_EMAIL: semrel-extra-bot@hotmail.com
```

### Four phases: receive + pack + verify + deliver

Maximum supply chain security. See [SECURITY.md](./SECURITY.md) for the threat model.

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

## Files

| File | Description |
|------|-------------|
| `src/main/js/post/release.js` | Pipeline router and context factory |
| `src/main/js/post/modes/receive.js` | Receive mode: analyze, preflight, write context |
| `src/main/js/post/modes/verify.js` | Verify mode: validate parcels against trusted context |
| `src/main/js/post/modes/deliver.js` | Deliver mode: deliver parcels through channels |
| `src/main/js/post/modes/pack.js` | Build, test, pack tars (+ all-in-one publish) |
| `src/main/js/post/courier/directive.js` | Directive build, parse, scan, orphan invalidation |
| `src/main/js/post/courier/semaphore.js` | Lock/unlock via tags, rebuild signaling |
| `src/main/js/post/courier/seniority.js` | Docs version protection via remote tag check |
| `src/main/js/post/courier/index.js` | Deliver loop: directive-aware with fallback |
| `src/main/js/post/depot/reconcile.js` | Preflight, re-resolve, tag conflict detection |
| `src/main/js/post/depot/context.js` | Context read/write/build for receive phase |
| `src/main/js/post/depot/steps/pack.js` | Tar packing, directive generation |
| `src/main/js/post/api/git.js` | Git primitives: annotated tags, remote tag ops, cache |
