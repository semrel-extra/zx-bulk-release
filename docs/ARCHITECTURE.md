# Architecture

zbr models the release process as a **postal system**. The codebase has three core domains — **depot**, **parcel**, and **courier** — surrounded by supporting layers.

## The metaphor

A monorepo release is like sending packages through a post office:

1. **Depot** inspects the goods (commits), decides what needs shipping (versions), builds and labels each item.
2. Each item is sealed into a **parcel** — a self-contained tar with a manifest and everything needed for delivery. No secrets inside, only `${{ PLACEHOLDER }}` stubs.
3. A **directive** is a shipping list: which parcels go where, in what order, grouped by destination type.
4. The **courier** picks up parcels, resolves credentials from the environment, and delivers them through **channels** — npm, git tags, GitHub releases, docs branches, etc.
5. A **semaphore** prevents two couriers from delivering the same commit simultaneously: one claims the delivery tag, the other backs off and signals a rebuild.

```
depot                    parcel                   courier
  ┌──────────────┐         ┌──────────────┐         ┌─────────────────┐
  │ analyze      │         │ manifest.json│         │ resolve creds   │
  │ resolve deps │───tar──▶│ + files      │───env──▶│ validate reqs   │
  │ build / test │         │ (no secrets) │         │ run channels    │
  └──────────────┘         └──────────────┘         └─────────────────┘
        ▲                        ▲                        │
        │                   directive                     ▼
     context              (shipping list)            npm, git, gh
```

## Topology

Before any work begins, zbr builds a dependency graph of all workspace packages via `@semrel-extra/topo`. The graph determines:

- **Processing order** — packages are analyzed, built, and packed in topological order. A leaf dependency is always processed before its dependents.
- **Version propagation** — when package `a` gets a version bump, all packages that depend on `a` are re-analyzed. If the bump satisfies the existing declaration (`workspace:^`), dependents update their manifests but may not need a new release themselves. If it doesn't satisfy — they get a forced patch bump.
- **Delivery order** — the directive encodes the same topological queue. The courier delivers packages in dependency order so that a consumer is never published before its dependency.

```
a ──▶ b ──▶ d
      ▲
c ────┘

queue: [[a, c], [b], [d]]
         ^^^^ parallel
```

`a` and `c` have no mutual dependencies — they run in parallel. `b` waits for both, `d` waits for `b`. The traversal (`traverseQueue`) walks the graph level by level, running independent packages concurrently within each level.

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
| clean       | Reset git config, restore npmrc |

Supporting modules:

- **deps** — topological sort, workspace protocol resolution (`workspace:*`), intra-monorepo version propagation. When a dependency bumps, all dependents re-resolve.
- **context** — `zbr-context.json`: a trusted snapshot of release decisions. Written by `receive` mode, consumed by `pack` and `verify`.
- **reconcile** — preflight: checks remote tags before committing to a release. Detects same-sha (skip), ancestor (proceed), diverged (abort).
- **generators** — tag formatting (4 formats: `lerna`, `pure`, `f0`, `f1`), metadata payloads, markdown release notes.

## Parcel

**How releases are packaged.** Serialization and validation.

A **parcel** is a tar archive containing:

- `manifest.json` — channel name, package name, version, credential placeholders, file list
- channel-specific files — npm tarball, docs directory, release notes, GitHub assets, meta.json

Credentials are stored as templates: `${{ NPM_TOKEN }}`, `${{ GH_TOKEN }}`. The build phase never sees real secrets.

A **directive** is a special meta-parcel — the shipping list for a commit:

- Authoritative list of all parcel filenames
- Package queue in dependency order
- Channel split: git-local channels first (serial), then external channels (parallel)

The directive enables coordinated delivery: the courier processes parcels in the right order, handles conflicts per-package, and marks orphaned parcels from stale builds.

**verify** validates parcels against the trusted context — checks sha, package names, versions, and channel assignments.

## Courier

**Where releases go.** Delivery dispatch and coordination.

The courier takes parcels and pushes them through channels:

1. Resolve `${{ VAR }}` templates in manifests from `process.env`
2. Validate required credentials per channel
3. Execute channels in order: transport (git) first, then external (npm, gh)
4. Report results: delivered / skipped / duplicate / conflict

### Channels

Each channel is `{ requires, when, prepare?, run, snapshot?, transport? }`:

| Channel     | Destination             | Git transport | Notes |
|-------------|-------------------------|---------------|-------|
| git-tag     | Annotated git tag       | yes           | Runs first. `conflict` → abort package, signal rebuild |
| npm         | npm registry            | no            | `duplicate` on 409 / EPUBLISHCONFLICT |
| gh-release  | GitHub release + assets | no            | REST API, not git push. `duplicate` on `already_exists` |
| gh-pages    | Docs branch             | yes           | Configurable branch and subdirectory |
| changelog   | Changelog branch        | yes           | Prepends release notes |
| meta        | Metadata branch/asset   | yes           | Three modes: commit, asset, tag |
| cmd         | Shell command           | no            | Runs in snapshot mode too |

**Git transport** channels deliver via `git push` (tags, branches). They run first and serially — a failed tag push means the commit is already claimed, so there's no point publishing to npm. **External** channels (npm, gh-release, cmd) use HTTP APIs and can run in parallel.

Channels return `'ok'`, `'duplicate'`, or `'conflict'`. A conflict on `git-tag` aborts all subsequent channels for that package.

### Semaphore

Distributed lock via git tags. Prevents concurrent delivery of the same commit.

- `tryLock` — push `zbr-deliver.{sha7}`. Atomic push = ownership.
- `unlock` — delete the lock tag after delivery.
- `signalRebuild` — push `zbr-rebuild.{sha7}` so CI re-runs with fresh state.
- `consumeRebuildSignal` — delete the signal at the start of the next run.

### Seniority

Prevents version downgrades. Before delivering, checks remote tags for a higher version of the same package. If found — skip.

## API

Low-level adapters. No business logic — just transport.

| Adapter | Scope |
|---------|-------|
| git     | clone, push, tag, fetch, commit, remote parsing, authenticated URLs |
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
  "packages": {
    "@scope/pkg": {
      "version": "2.1.0",
      "tag": "@scope/pkg-v2.1.0",
      "channels": ["npm", "git-tag", "gh-release"]
    }
  }
}
```

Only versions, tags, and channel lists — no paths, no manifests, no secrets. This is the minimum needed to verify that parcels produced later are legitimate.

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

1. sha7 prefix must match the context
2. Channel must be in the package's expected channel list
3. Package name and version must match a context entry
4. No extra parcels — files that don't match any expected package are rejected

Only verified tars are copied to `output/`. Rejected parcels produce hard errors — the pipeline stops. If input and output are the same directory, verification happens in place.

**Deliver (clean runner):**

The courier reads from the verified directory. `scanDirectives()` finds directive tars sorted by timestamp (oldest first — stale builds are processed before fresh ones). For each directive:

1. `invalidateOrphans()` — any parcel in the directory matching this commit's sha7 but **not** listed in the directive's `parcels` array is overwritten with the string `'orphan'`. This neutralizes tars injected by a compromised build or leftover from a previous run.
2. Parcels marked as `released`, `skip`, `conflict`, or `orphan` are skipped.
3. Remaining parcels are unpacked, credentials resolved from env, and delivered through channels.

```
build job                        deliver job
─────────                        ──────────
parcels/                    ┌──▶ parcels-unverified/
  parcel.abc1234.npm...tar  │      (downloaded artifact)
  parcel.abc1234.git-tag..  │           │
  parcel.abc1234.directive. │      --verify in:out
  (untrusted)               │           │
        │                   │    parcels/
   upload artifact ─────────┘      parcel.abc1234.npm...tar  ✓
                                   parcel.abc1234.git-tag..  ✓
                                   parcel.abc1234.directive.  ✓
                                   (injected.tar → rejected)
                                        │
                                   --deliver
                                   (credentials resolved, channels run)
```

## Config

cosmiconfig-compatible lookup: `package.json#release`, `.releaserc`, `.releaserc.{json,yaml,yml,js,cjs}`, `release.config.{js,cjs}`. Walks up from package dir to repo root.

Environment variables (`GH_TOKEN`, `NPM_TOKEN`, `GH_URL`, `NPM_REGISTRY`, `NPM_OIDC`, etc.) are parsed into a flat config object and merged with file-based config.
