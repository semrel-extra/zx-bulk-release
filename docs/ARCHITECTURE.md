# Architecture

zbr models the release process as a **postal system**. The codebase has three core domains — **depot**, **parcel**, and **courier** — surrounded by supporting layers.

## The metaphor

A monorepo release is like sending packages through a post office:

1. **Depot** inspects the goods (commits), decides what needs shipping (versions), builds and labels each item.
2. Each item is sealed into a **parcel** — a self-contained tar with a manifest and everything needed for delivery. No secrets inside, only `${{ PLACEHOLDER }}` stubs.
3. A **directive** is a shipping list: which parcels belong to which package, and which package waits for which.
4. The **courier** picks up parcels, resolves credentials from the environment, and delivers them through **channels** — npm, git tags, GitHub releases, docs branches, etc.
5. A **semaphore** prevents two couriers from delivering the same commit simultaneously: one claims the delivery tag, the other backs off. A courier that finds its version claimed by another commit signals a rebuild.

```
depot                    parcel                   courier
  +--------------+         +--------------+         +-----------------+
  | analyze      |         | manifest.json|         | resolve creds   |
  | resolve deps |---tar-->| + files      |---env-->| validate reqs   |
  | build / test |         | (no secrets) |         | run channels    |
  +--------------+         +--------------+         +-----------------+
        ^                        ^                        |
        |                   directive                     v
     context              (shipping list)            npm, git, gh
```

## Topology

Before any work begins, zbr builds a dependency graph of all workspace packages via `@semrel-extra/topo`. The graph determines:

- **Processing order** — packages are analyzed, built, and packed in topological order. A leaf dependency is always processed before its dependents.
- **Version propagation** — when package `a` gets a version bump, all packages that depend on `a` are re-analyzed. If the bump satisfies the existing declaration (`workspace:^`), dependents update their manifests but may not need a new release themselves. If it doesn't satisfy — they get a forced patch bump.
- **Delivery order** — the directive encodes the same topological queue. The courier delivers packages in dependency order so that a consumer is never published before its dependency.

```
a --> b --> d
      ^
c ----'

queue: [[a, c], [b], [d]]
         ^^^^ parallel
```

`a` and `c` have no mutual dependencies — they run in parallel. `b` waits for both, `d` waits for `b`. The traversal (`traverseQueue`) starts each package as soon as the packages it depends on are done, so independent ones run concurrently.

If `a` bumps from 1.0.0 to 1.1.0, `b` re-resolves its dep on `a`, updates its manifest, and may get a cascading patch. `d` then re-resolves its dep on `b`, and so on.

The graph is also used for filtering: `--only-workspace-deps` limits the release to packages reachable from the changed ones.

This topology-aware execution makes zbr useful beyond releases — as a general-purpose monorepo task runner. The `buildCmd`, `testCmd`, and `publishCmd` hooks run arbitrary shell commands scoped to the semantically changed area of the graph. In [misc](https://github.com/nicholasgasior/misc), zbr was used purely as a build orchestrator — running builds only for affected packages, with correct dependency ordering and parallelism, without publishing anything.

## Depot

**What to release.** Analysis, version resolution, artifact preparation.

The depot processes each package in topological order through a step pipeline:

| Step        | What it does |
|-------------|-------------|
| contextify  | Attach config, latest tag/meta, git state to the package |
| analyze     | Parse commits since last tag, apply semantic rules, resolve next version |
| build       | Run `buildCmd`, or fetch pre-built tarball from npm if nothing changed |
| test        | Run `testCmd` |
| pack        | Seal artifacts into parcels — one tar per active channel |
| publish     | Hand parcels to courier, run optional `publishCmd` |
| clean       | Restore package manifests |

Supporting modules:

- **deps** — topological sort, workspace protocol resolution (`workspace:*`), intra-monorepo version propagation. When a dependency bumps, all dependents re-resolve.
- **context** — `zbr-context.json`: a trusted snapshot of release decisions. Written by `receive` mode, consumed by `pack` and `verify`.
- **reconcile** — preflight: reads the commit a remote release tag points to before committing to a release. Same commit → skip; ours is newer → re-resolve the version; older or diverged → skip.
- **generators** — tag formatting (4 formats: `lerna`, `pure`, `f0`, `f1`), metadata payloads, markdown release notes.

## Parcel

**How releases are packaged.** Serialization and validation.

A **parcel** is a tar archive containing:

- `manifest.json` — channel name, package name, version, credential placeholders, file list
- channel-specific files — npm tarball, docs directory, release notes, GitHub assets, meta.json

Credentials are stored as templates: `${{ NPM_TOKEN }}`, `${{ GH_TOKEN }}`. The build phase never sees real secrets.

A **directive** is a special meta-parcel — the shipping list for a commit:

- The parcels of each package
- The packages and the dependencies between them

The courier doesn't take the channel order from it: the stages are its own. The directive enables coordinated delivery: the courier delivers packages in dependency order, handles conflicts per package, and marks orphaned parcels from stale builds.

**verify** validates parcels against the trusted context — sha, package names, versions and channel assignments (including the package inside the npm tarball, read the way npm reads it), the npm dist-tag, and that pack kept the release tags, the `populate` rules, the commit and its time. The directive may list only context packages, each with one verified parcel per channel and every dependency.

## Courier

**Where releases go.** Delivery dispatch and coordination.

The courier takes parcels and pushes them through channels:

1. Resolve `${{ VAR }}` templates in manifests from `process.env`
2. Check each parcel: required credentials, `populate` rules, that it belongs to its package
3. Deliver package by package in dependency order, channel by stage: claim → publish → announce
4. Report results: delivered / skipped / duplicate / conflict

### Channels

Each channel is `{ name, stage?, requires, when, prepare?, run(manifest, dir, {gitRoot}), snapshot?, transport? }` (no stage means `publish`). `gitRoot` is the delivery repo: the checkout deliver runs in, or a fresh repo bound to `GITHUB_REPOSITORY`.

| Channel     | Destination             | Stage    | Notes |
|-------------|-------------------------|----------|-------|
| git-tag     | Annotated git tag       | claim    | The remote decides: the tag is ours (`ok`, `duplicate`) or another commit's (`conflict`) |
| npm         | npm registry            | publish  | `duplicate` on a known republish error, or when the registry has the version |
| gh-release  | GitHub release + assets | announce | REST API. `duplicate` on `already_exists` only |
| gh-pages    | Docs branch             | announce | Configurable branch and subdirectory |
| changelog   | Changelog branch        | announce | Prepends release notes, once |
| meta        | Metadata branch/asset   | announce | Three modes: commit, asset, tag |
| cmd         | Shell command           | —        | `publishCmd`: all-in-one only, after the package's delivery |

**Claim before act.** Nothing else of a package goes out until its claim is released — the release tag, which every release but a snapshot has, is ours. That is what makes the version ours. npm follows right after the claim; the announcements describe what has been published and run in parallel. Each stage waits for all its parcels. A conflict sends the package and the packages depending on it to the rebuild; a failure stops the package; a parcel this env can't deliver (missing credentials) is held without blocking the rest.

Channels return `'ok'`, `'duplicate'`, or `'conflict'`; anything else is thrown. Errors don't race ahead: the courier lets everything in flight settle, releases the lock, and reports the errors together.

### Semaphore

Distributed lock via git tags at the release commit. Prevents concurrent delivery of the same commit.

- `tryLock` — push `zbr-deliver.{sha7}`. Atomic push = ownership. A push that fails while the tag is absent is an error, never "locked".
- `unlock` — delete the lock tag once everything has settled.
- `signalRebuild` — push `zbr-rebuild.{sha7}` after unlocking, so CI re-runs with fresh state.
- `consumeRebuildSignal` — delete the signal at the start of the next run.

### Seniority

Prevents version downgrades. Before committing docs, changelog or meta, checks the delivery repo's remote tags for a higher version of the same package. If found — skip.

### Git workspaces

`api/git.js` is the only module that runs git. Commands that write a repo's `.git` go one at a time per repo, so parallel packages never race on its locks. Commits and tags carry the release identity in `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env: zbr never writes git config. A claim fetches the release commit by sha, tags it and reads the outcome from the remote. A branch commit (meta, changelog, gh-pages) is a fresh read-modify-write on the remote tip at every attempt, so a rejected push leaves nothing half-done behind.

## API

Low-level adapters. No business logic — just transport.

| Adapter | Scope |
|---------|-------|
| git     | the only module that runs git: claims, branch commits, remote tags, per-repo lock, identity via env |
| gh      | GitHub REST: releases, assets, fetch with API headers |
| npm     | Registry fetch/publish, OIDC auth, npmrc management |

## Modes

In single-phase mode (no flags), zbr does everything in one process: analyze → build → test → pack → deliver. Simple, but the process that builds code also holds publish credentials.

The four-mode split exists to create **trust boundaries**:

| Mode    | Input            | Output               | Has secrets | Has source |
|---------|------------------|-----------------------|-------------|------------|
| receive | git history      | `zbr-context.json`   | no          | no (`yarn install` not yet run) |
| pack    | source + context | `parcels/*.tar`      | no          | yes |
| verify  | parcels + context| verified parcels     | no          | no |
| deliver | parcels          | published artifacts  | yes         | no |

The key insight: **the phase that runs arbitrary code (pack) never sees credentials, and the phase that holds credentials (deliver) never runs arbitrary code.** A compromised build step can produce malicious parcels, but they won't pass verify — sha, version, and channel must match the trusted context written by receive before `yarn install`.

See [SECURITY.md](./SECURITY.md) for the full threat model.

## Logging & reporting

All output goes through a centralized logger (`log.js`) that redacts secrets. Tokens registered via `log.secret(value)` are replaced with `***` in every log line — no credential can leak into CI output or report files, even if a channel adapter logs its request verbatim.

`createReport()` builds a structured report object that tracks:

- **Run status** — `initial` → `pending` → `released` / `failed`
- **Per-package status** — same lifecycle, scoped by name
- **Events** — timestamped `{msg, scope, level}` entries

The report doubles as the runtime logger: `report.log(...)` both prints to console and appends to the events array. When `--report <path>` is set, every `setStatus()` call persists the report to disk as JSON via `fs.outputJsonSync` — crash-safe, always up to date.

`$.scope` ties log lines to the package currently being processed, so interleaved parallel output stays readable.

## Context

Two kinds of context flow through the pipeline:

**Runtime context** — in-memory object assembled at startup: `cwd`, `env`, `flags`, `packages` (full objects with manifests, paths, git state), `queue`, dependency graphs (`prev`/`next`), `report`, `channels`, `run`. Lives for one process, never serialized whole.

**Serialized context** (`zbr-context.json`) — a minimal trust anchor written by `--receive`:

```json
{
  "status": "proceed",
  "sha": "abc1234...",
  "sha7": "abc1234",
  "timestamp": 1718000000,
  "snapshot": false,
  "prev": {"@scope/app": ["@scope/pkg"]},
  "packages": {
    "@scope/pkg": {
      "version": "2.1.0",
      "tag": "@scope/pkg-v2.1.0",
      "channels": ["npm", "git-tag", "gh-release"],
      "populate": {"schemas": {"*": {}}, "channels": {"*": {"*": {"schema": "*"}}}}
    }
  }
}
```

Versions, tags, channel lists, `populate` rules, the commit time, the dependencies between the released packages and whether npm publishes them as snapshots — no paths, no manifests, no secrets. This is the minimum needed to verify that parcels produced later are legitimate.

**Flow between modes:**

```
receive → writeContext()        (before yarn install, uploaded as artifact)
pack    → readContext()         (filters: only build packages listed here)
verify  → readContext()         (validates parcels against it)
deliver → doesn't need context  (reads directives and parcels directly)
```

`readContext()` validates structure on load — missing `sha`, `packages`, or `status` throws immediately. A context with `status: 'skip'` short-circuits all downstream modes.

## Parcel lifecycle

Parcels cross a trust boundary between the build and deliver jobs. Their movement is explicit and auditable.

**Pack (untrusted environment):**

`buildParcels()` seals each package×channel into `parcels/parcel.{sha7}.{channel}.{pkgName}.{version}.{hash}.tar`. Credentials inside are template stubs (`${{ NPM_TOKEN }}`). After all packages are packed, `buildDirective()` writes a directive tar — the authoritative shipping list for this commit.

All tars live in `parcels/` and are uploaded as a single CI artifact.

**Verify (clean runner):**

`--verify input:output` reads parcels from `input/`, validates each against the trusted context:

1. sha7 prefix must match the context; file names hold only what pack writes, and links are refused
2. Channel must be in the package's expected channel list
3. Package name and version must match a context entry
4. No extra parcels — files that don't match any expected package are rejected
5. Each manifest's channel, package and version match its file name; its release tag, commit and `populate` rules match the context
6. The npm tarball's `package.json`, read the way npm reads it, names the same package and version; the npm dist-tag (snapshot or not) matches the context
7. There is one directive, named for the commit time; its commit and time match the context — directives are delivered oldest first
8. The directive lists only context packages, with their versions and tags, one verified parcel per context channel and every dependency the context knows. It may hold packages back (phases run with different flags): verify names them
9. Markers (what a delivery leaves behind) are only where a courier leaves them

Only verified tars are copied to `output/`, and parcels already lying there that verify didn't pass are an error. Rejected parcels produce hard errors — the pipeline stops. If input and output are the same directory, verification happens in place.

**Deliver (clean runner):**

The courier reads from the verified directory. `scanDirectives()` finds directive tars sorted by timestamp (oldest first — stale builds are processed before fresh ones). For each directive:

1. `invalidateOrphans()` — any parcel in the directory matching this commit's sha7 but listed by none of the directive's packages is overwritten with the string `'orphan'`. This neutralizes tars injected by a compromised build or leftover from a previous run.
2. Parcels marked as `released`, `conflict`, or `orphan` (or `skip`, written by 3.x) are settled; a marker on a claim counts for what the remote says about the tag.
3. Remaining parcels are unpacked, credentials resolved from env, and delivered stage by stage.

```
build job                        deliver job
---------                        ----------
parcels/                    +--> parcels-unverified/
  parcel.abc1234.npm...tar  |      (downloaded artifact)
  parcel.abc1234.git-tag..  |           |
  parcel.abc1234.directive. |      --verify in:out
  (untrusted)               |           |
        |                   |    parcels/
   upload artifact ---------'      parcel.abc1234.npm...tar  ok
                                   parcel.abc1234.git-tag..  ok
                                   parcel.abc1234.directive.  ok
                                   (injected.tar -> rejected)
                                        |
                                   --deliver
                                   (credentials resolved, channels run)
```

## Config

cosmiconfig-compatible lookup: `package.json#release`, `.releaserc`, `.releaserc.{json,yaml,yml,js,cjs}`, `release.config.{js,cjs}`. Walks up from package dir to repo root.

Environment variables (`GH_TOKEN`, `NPM_TOKEN`, `GH_URL`, `NPM_REGISTRY`, `NPM_OIDC`, etc.) are parsed into a flat config object and merged with file-based config.
