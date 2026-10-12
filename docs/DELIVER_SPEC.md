# Deliver: coordinated delivery specification

## Problem

Multiple zbr processes may concurrently build and deliver artifacts for overlapping packages from different (or the same) commits. Without coordination:
- Tag races — two processes push the same tag
- Docs overwritten — older version overwrites newer
- Duplicate registry publishes
- Invalid deliveries — parcels built for a version whose tag is already claimed by another SHA

## Principles

1. **Credential isolation.** The pack phase has zero secrets. All credentials (`GH_TOKEN`, `NPM_TOKEN`, `GIT_COMMITTER_*`) exist only in deliver. Manifests contain `${{ENV_VAR}}` placeholders resolved at delivery time. Tars can be stored, transferred, and inspected without leak risk.
2. **The remote decides who owns a version.** A git tag push is the sole coordination primitive: atomic, cross-platform, no external services. The outcome is read from the remote, never from error text: a pushed tag is ours; a tag already at our commit is ours too (a re-run); a tag at another commit is a conflict; a rejected push that leaves no tag is an error.
3. **Annotated tag body as data envelope.** Mutex and payload in one mechanism.
4. **Claim before act.** Nothing else of a package goes out until its claim — the release tag, which every release but a snapshot has — is ours. Channels run in stages: claim → publish → announce.
5. **Settle before deciding.** Every stage waits for all its parcels. The lock is released, the rebuild signalled and the markers written only after everything has settled. Errors are reported together.
6. **Build as transactional unit.** All parcels of one build are delivered by a single process at a time. Splitting across processes breaks integrity guarantees.
7. **Markers are a cache, not the source of truth.** Delivered and conflicted parcels are overwritten with a status marker, so a re-run skips them. With a directive, a marker on a claim counts only for what the remote says. Parcels this env can't deliver (missing credentials) stay intact for one that can.
8. **Conflicts are self-resolving.** A lost claim sends its package and the packages that depend on it to the rebuild. Each rebuild sees fresh tags and gets a new version, so loops are impossible.

## Artifacts

### Parcel

A tar archive containing the manifest and files for one channel of one package.

```
parcel.{sha7}.{channel}.{name}.{version}.{hash6}.tar
```

- `sha7` — first 7 characters of the commit SHA
- `channel` — delivery channel (`git-tag`, `npm`, `gh-release`, ...)
- `name` — package name encoded injectively: `[a-z0-9-]` as is, `@scope/pkg` → `scope__pkg`, other chars → `_xx` (UTF-8 bytes)
- `version` — semver version
- `hash6` — 6-character SHA-1 of tar contents (content-addressable dedup)

The manifest inside the tar contains `${{ENV_VAR}}` placeholders resolved at delivery time via `resolveManifest()`. A parcel holds plain files only: the courier refuses entries that are links or would land outside the directory it unpacks into.

### Directive

A meta-parcel describing the complete delivery map of one build. Pack writes it next to the parcels.

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
    "parcel.abc1234.npm.a.1.0.1.f0e1d2.tar",
    "parcel.abc1234.git-tag.a.1.0.1.a1b2c3.tar"
  ],
  "prev": {
    "b": ["a"]
  },
  "packages": {
    "a": {
      "version": "1.0.1",
      "tag": "2026.4.12-a.1.0.1-f0",
      "deliver": [["git-tag"], ["npm"]],
      "parcels": [
        "parcel.abc1234.git-tag.a.1.0.1.a1b2c3.tar",
        "parcel.abc1234.npm.a.1.0.1.f0e1d2.tar"
      ]
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `sha` | Full commit SHA of the build |
| `timestamp` | Epoch timestamp of the commit (seconds) |
| `queue` | Packages of the build |
| `prev` | Dependency graph: `{name: [deps]}`. The courier orders packages by it, wherever they stand in `queue`, and runs independent ones in parallel |
| `parcels` | All parcel filenames of the build (informational) |
| `packages[name].parcels` | The parcels the courier delivers for this package, and the ones orphan invalidation keeps |
| `packages[name].deliver` | The stages as steps, written for 3.x couriers. A 4.x courier ignores it: delivery order is courier policy, not pack-phase data |

#### Stages

| Stage | Channels | Rule |
|-------|----------|------|
| claim | `git-tag` | Nothing else of the package goes out until the claim is released: pushed now, already at our commit, or delivered earlier |
| publish | `npm` | Right after the claim. In all-in-one a re-run skips a package whose tag is already ours, so the package can't wait behind the announcements |
| announce | `gh-release`, `meta`, `changelog`, `gh-pages` | Describe what is published; run in parallel |

A channel without a stage runs in `publish`. `cmd` (`publishCmd`) is not a parcel: in all-in-one mode it runs after the package's delivery.

#### Orphan invalidation

On delivery, every file matching `parcel.{sha7}.*.tar` that no `packages[*].parcels` list names is overwritten with `orphan`. This cleans up stale parcels from previous non-deterministic builds of the same commit (different content hash → different filename → both exist, but only the directive's set is valid).

## Semaphores

Two tag types, both annotated and both pointing at the release commit, the one the directive delivers:

| Tag | Purpose | Lifetime |
|-----|---------|----------|
| `zbr-deliver.{sha7}` | Lock build delivery to one process | Duration of delivery |
| `zbr-rebuild.{sha7}` | Signal CI to rebuild | Until a rebuild process consumes it |

Both are pushed through the same claim primitive as release tags: push; if the push is rejected, read the tag from the remote. There → someone else holds it. Not there → the push itself failed (no access, a hook, a ruleset, the network), which is an error, never "locked".

### Delivery lock

```
zbr-deliver.{sha7}
```

Annotated tag body:

```json
{
  "ts": 1718000000,
  "sha": "abc1234567890",
  "packages": ["a", "b", "c"],
  "holder": "6f1c…"
}
```

The holder makes every lock tag object unique: two runners creating identical tag objects within the same second would otherwise both see their push succeed.

- **Acquire:** create the tag at the release commit and push it — atomic
- **Release:** `git push origin :refs/tags/zbr-deliver.{sha7}`, in `finally`, once everything has settled. A failed release is logged: the lock is left for manual removal
- **Check:** `git ls-remote --tags origin 'zbr-deliver.*'`

### Zombie lock

Process crashed or was killed without releasing the lock. zbr doesn't break locks: remove the tag by hand (or add a cleanup step to the workflow). Until then every delivery of that commit skips it, with a warning naming the tag.

### Rebuild signal

```
zbr-rebuild.{sha7}
```

Pushed after the lock is released, so the rebuild's own delivery doesn't find the lock. A tag that already exists means the rebuild is already signalled. CI trigger:

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
deliver(tars, env, {cwd, dryRun}):
  gitRoot = openRepo(cwd)       // the checkout around cwd, or a fresh repo bound to GITHUB_REPOSITORY
  directives = unmarked directives among the tars, oldest first

  for directive of directives:
    if dryRun:
      plan and rehearse it      // no lock, no remote mutation, no markers
      continue
    if !tryLock(directive) → continue           // another process delivers it

    try:
      invalidateOrphans(dir, directive)
      plan = planOf(directive)  // listed parcels only; claim markers confirmed on the remote
      errors = execute(plan)    // everything settles
    finally:
      unlock(directive)

    if any package lost its claim → signalRebuild(sha)   // a failed signal is one more error
    write parcel markers
    mark the directive: errors → none (a re-run retries), conflict → 'conflict',
                        everything delivered → 'released', else none (parcels are held)
    throw the errors, one as is, several as one AggregateError

  if the tars hold no directive at all:           // all-in-one, or a dir without one
    plan = looseOf(tars)        // every name@version is a package; versions of a name in ascending order
    errors = execute(plan, {concurrency: 4})
    write parcel markers
    throw the errors and the lost claims: nobody rebuilds a delivery without a directive
```

A directive marked `released` or `conflict` is done: its leftover parcels never go out without it.

### execute — the rules

```
execute(plan):
  walk the packages by their dependencies, independent ones in parallel
  for each package:
    a dependency lost its claim                       → conflict: wait for the rebuild
    a dependency is held, or an error happened anywhere → hold: wait for a re-run
    for stage of [claim, publish, announce]:
      settle every parcel of the stage                 // never throws; errors are kept
      a parcel lost its claim  → mark every unsettled parcel of the package 'conflict', stop
      a parcel failed          → hold the rest, stop
      the claim isn't released → hold the rest, stop  // held, invalid, missing, dropped
```

Without a directive, versions of one package only follow each other: a lost claim of `a@1.0.0` doesn't hold `a@1.0.1`, which claims its own tag.

### Parcel states

| State | Comes from | What happens |
|-------|------------|--------------|
| ready | a tar this env can deliver | Delivered in its stage |
| released | a `released` marker | Done. With a directive, a claim counts only if the tag is at the release commit on the remote |
| conflict | a `conflict` marker | The package waits for the rebuild. With a directive, a claim counts only if the tag is at another commit |
| held | missing credentials, unknown channel, missing from the dir | Stays intact for an env that can deliver it, unless its package goes to the rebuild. A held claim holds its package |
| invalid | breaks its populate rules, unreadable, belongs to another package, a claim marker the remote denies | Stays intact unless its package goes to the rebuild; is reported and fails the run at the end |

Without a directive a marker carries no manifest, so it can't be tied to a package: there, markers only say what not to deliver again.
| dropped | an `orphan` marker, or a 3.x `skip` marker | Nothing to deliver |

The courier writes `released`, `conflict` and `orphan`. It no longer writes `skip`: a held parcel stays a valid tarball.

### Channel outcomes

| Channel | Outcome |
|---------|---------|
| `git-tag` | Read from the remote: pushed → `ok`; tag at our commit → `duplicate`; tag elsewhere → `conflict`; push rejected and no tag → error |
| `npm` | `EPUBLISHCONFLICT` or "cannot publish over" → `duplicate`. Any other failure: if the registry has the version (read the way publish reaches it) → `duplicate`, else the error stands. The claim already proves the version is ours |
| `gh-release` | `already_exists` → `duplicate`; any other validation error is an error |
| `gh-pages`, `changelog`, `meta` | Every attempt rebuilds the commit on the remote tip; no delta → no commit, `ok` |

### Docs seniority protection

Channels `gh-pages`, `changelog`, and `meta` check before committing: does a remote tag for a higher version of the same package exist? If so, skip — our docs are outdated. The check reads the delivery repo's remote; a failed read is an error.

```
remoteTags = git ls-remote --tags --refs origin
higherExists = remoteTags.has(tag for same pkg with version > ours)
if higherExists → skip (do not commit)
```

## Scenarios

### 1. Single process, normal delivery

```
zbr pack → directive + parcels
zbr deliver:
  lock directive → success
  a: git-tag → ok, then npm → ok, then gh-release, changelog → ok
  b: git-tag → ok, then npm → ok
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
           a: git-tag a@1.0.1 → ok → deliver the rest
           unlock

process 2: lock sha=bbb → ok
           a: git-tag a@1.0.1 → the tag is at aaa → conflict
           → a's parcels → "conflict"
           → c depends on a → c's parcels → "conflict", c's tag is never pushed
           b: git-tag b@2.0.0 → ok → deliver the rest
           unlock
           push zbr-rebuild.bbb → CI triggers

process 3 (rebuild):
           delete zbr-rebuild.bbb
           pack: preflight → a@1.0.1 tag taken → re-resolve → a@1.0.2, c re-resolves too
           deliver: a@1.0.2, c → ok
```

### 4. Two processes, same commit

```
process 1: lock sha=aaa → ok → deliver → unlock
process 2: lock sha=aaa → the lock tag is on the remote → skip

           if process 1 finishes first, process 2 sees "released" markers
           if process 1 crashes, a removed zombie lock lets process 2 retry
```

### 5. Partial delivery (missing credentials)

```
process 1 (GH_TOKEN only):
  lock directive → ok
  a: git-tag → ok
  a: npm → held (no NPM_TOKEN), parcel untouched
  a: gh-release → ok
  unlock
  directive stays valid

process 2 (NPM_TOKEN), same parcels dir:
  lock directive → ok (lock was released)
  a: git-tag → "released" marker → the remote has the tag at the release commit → released
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
build 1: produces parcel.abc1234.npm.pkg.1.0.1.aaa111.tar
build 2: produces parcel.abc1234.npm.pkg.1.0.1.bbb222.tar
         overwrites directive (same filename, last-writer-wins)

deliver:
  reads directive → packages list bbb222
  invalidateOrphans → aaa111 is listed nowhere → marked "orphan"
  delivers only bbb222
```

### 8. Re-run with fresh copies of the parcels

```
deliver job fails halfway; CI re-runs it, downloading the parcels again (no markers):
  lock directive → ok
  a: git-tag → the tag is at our commit → duplicate
  a: npm → "cannot publish over" → duplicate
  a: changelog, meta → no delta → ok
  b: whatever the first run didn't finish → ok
  unlock
  directive → "released"
```

### 9. A tag created by GitHub

```
someone creates a GitHub release for a@1.0.1 by hand before zbr claims the tag:
  GitHub creates a lightweight tag a@1.0.1 at the default branch tip
deliver:
  a: git-tag → the tag is at another commit → conflict → rebuild
```

zbr's own gh-release never creates a tag this way: it runs only after the claim has put the tag at the release commit.

### 10. Delivery without a directive (all-in-one)

```
publish(a) → deliver(a's parcels):
  no lock (one process, one package)
  a: git-tag → ok, npm → ok, announcements → ok
  a lost claim fails the run: there is no rebuild signal for a delivery without a directive
```

## Preflight

Between `analyze` and `build` — checks tag availability on remote. Eliminates conflicts before building, saves build/test time.

```
preflight(pkg):
  commit = the commit the remote tag points to (peeled, annotated or lightweight)

  if !commit → ok, tag is free

  if commit == ctx.git.sha → skip (duplicate, this commit already processed)

  git fetch origin --tags --force                // the tagged commit
  git fetch origin --deepen=100                  // history for merge-base

  if ours is ancestor of remote → skip (we are older)
  if remote is ancestor of ours → analyze again from the fetched tags:
                                    a new version and tag, or skip if nothing changed since
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

## Files

| File | Description |
|------|-------------|
| `src/main/js/post/release.js` | Pipeline router and context factory |
| `src/main/js/post/modes/receive.js` | Receive mode: analyze, preflight, write context |
| `src/main/js/post/modes/verify.js` | Verify mode: validate parcels against trusted context |
| `src/main/js/post/modes/deliver.js` | Deliver mode: deliver parcels through channels |
| `src/main/js/post/modes/pack.js` | Build, test, pack tars (+ all-in-one publish) |
| `src/main/js/post/parcel/directive.js` | Directive build, parse, scan, orphan invalidation |
| `src/main/js/post/parcel/verify.js`, `verify-directive.js` | Parcel and directive verification |
| `src/main/js/post/courier/index.js` | Deliver: repo, lock, plan, execute, signal, markers |
| `src/main/js/post/courier/plan.js` | Parcel states and delivery plans, with or without a directive |
| `src/main/js/post/courier/execute.js` | The delivery rules: stages, claim before act, settle before deciding |
| `src/main/js/post/courier/channels/index.js` | Channel registry and stages |
| `src/main/js/post/courier/semaphore.js` | Lock/unlock via tags, rebuild signaling |
| `src/main/js/post/courier/seniority.js` | Docs version protection via remote tag check |
| `src/main/js/post/depot/reconcile.js` | Preflight, re-resolve, tag conflict detection |
| `src/main/js/post/depot/context.js` | Context read/write/build for receive phase |
| `src/main/js/post/depot/steps/pack.js` | Tar packing |
| `src/main/js/post/tar.js` | Tar pack/unpack, markers, reading manifests and npm tarballs |
| `src/main/js/post/api/git.js` | Git: the only module that runs it; per-repo lock, identity via env, the claim primitive |
