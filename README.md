# zx-bulk-release
> [zx](https://github.com/google/zx)-based alternative for [multi-semantic-release](https://github.com/dhoulb/multi-semantic-release)

[![CI](https://github.com/semrel-extra/zx-bulk-release/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/semrel-extra/zx-bulk-release/actions/workflows/ci.yml)
[![Maintainability](https://qlty.sh/gh/semrel-extra/projects/zx-bulk-release/maintainability.svg)](https://qlty.sh/gh/semrel-extra/projects/zx-bulk-release)
[![Code Coverage](https://qlty.sh/gh/semrel-extra/projects/zx-bulk-release/coverage.svg)](https://qlty.sh/gh/semrel-extra/projects/zx-bulk-release)
[![npm (tag)](https://img.shields.io/npm/v/zx-bulk-release)](https://www.npmjs.com/package/zx-bulk-release)

## Key features
* [Conventional commits](https://www.conventionalcommits.org/en/v1.0.0/#specification) trigger semantic releases.
* Automated cross-pkg version bumping.
* Predictable [toposort](https://github.com/semrel-extra/topo)-driven flow.
* No default branch blocking (no release commits).
* Pkg changelogs go to `changelog` branch (configurable).
* Docs are published to `gh-pages` branch (configurable).
* No extra builds. The required deps are fetched from the pkg registry (`npmFetch` config opt).
* **Two-phase pipeline**: build and delivery can run as separate jobs with isolated credentials.


> [!NOTE]
> **[Migration guide v2 → v3](./MIGRATION_V2_V3.md)**

## Roadmap
* [x] Store release metrics to `meta`.
* [x] Two-phase pipeline (pack / deliver).
* [ ] Multistack. Add support for java/kt/py.
* [ ] Semaphore. Let several release agents to serve the monorepo at the same time.

## Requirements
* macOS / linux
* Node.js >= 16.0.0
* npm >=7 / yarn >= 3
* tar
* git

## Usage
### Install
```shell
yarn add zx-bulk-release
```
### CLI
```shell
GH_TOKEN=ghtoken GH_USER=username NPM_TOKEN=npmtoken npx zx-bulk-release [opts]
```
| Flag                         | Description                                                                                       | Default          |
|------------------------------|---------------------------------------------------------------------------------------------------|------------------|
| `--pack [dir]`               | Pack only: build, test, and write delivery tars to `dir`. No credentials needed.                  | `parcels`        |
| `--deliver [dir]`            | Deliver only: read tars from `dir` and run delivery channels. No source code needed.              | `parcels`        |
| `--ignore`                   | Packages to ignore: `a, b`                                                                        |                  |
| `--include-private`          | Include `private` packages                                                                        | `false`          |
| `--concurrency`              | `build/publish` threads limit                                                                     | `os.cpus.length` |
| `--no-build`                 | Skip `buildCmd` invoke                                                                            |                  |
| `--no-test`                  | Disable `testCmd` run                                                                             |                  |
| `--no-npm-fetch`             | Disable npm artifacts fetching                                                                    |                  |
| `--only-workspace-deps`      | Recognize only `workspace:` deps as graph edges                                                   |                  |
| `--dry-run` / `--no-publish` | Disable any publish logic                                                                         |                  |
| `--report`                   | Persist release state to file                                                                     |                  |
| `--snapshot`                 | Publish only to `npm` snapshot channel and run `publishCmd` (if defined), skip everything else    |                  |
| `--debug`                    | Enable [zx](https://github.com/google/zx#verbose) verbose mode                                    |                  |
| `--version` / `-v`           | Print own version                                                                                 |                  |

### Two-phase pipeline
By default, zbr runs the full pipeline in a single process. For better security isolation, split build and delivery into separate CI jobs:

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
      - if: steps.download.outcome == 'success'
        uses: actions/upload-artifact@v4
        with: { name: parcels, path: parcels, overwrite: true, retention-days: 1 }
```

After delivery, each tar is replaced with a marker (`released` or `skip`). The final `upload-artifact` syncs these markers back to CI storage, so a re-run of the deliver job will skip already-delivered parcels. Artifacts expire naturally via retention policy.

**Recovery** is simply re-running the deliver job. Only undelivered tars (not yet replaced with markers) will be processed. No rebuild required.

### JS API
```js
import { run } from 'zx-bulk-release'

const cwd = '/foo/bar'
const env = {GH_TOKEN: 'foo', NPM_TOKEN: 'bar'}
const flags = {dryRun: true}

await run({
  cwd,    // Defaults to process.cwd()
  flags,  // Defaults to process.env
  env     // Defaults to minimist-parsed `process.argv.slice(2)`
})
```

## Config
### cosmiconfig
Any [cosmiconfig](https://github.com/davidtheclark/cosmiconfig) compliant format: `.releaserc`, `.release.json`, `.release.yaml`, etc in the package root or in the repo root dir.
```json
{
  "buildCmd": "yarn && yarn build",
  "testCmd": "yarn test",
  "npmFetch": true,
  "changelog": "changelog",
  "ghPages": "gh-pages",
  "diffTagUrl": "${repoPublicUrl}/compare/${prevTag}...${newTag}",
  "diffCommitUrl": "${repoPublicUrl}/commit/${hash}"
}
```

#### Command templating
`buildCmd`, `testCmd` and `publishCmd` support `${{ variable }}` interpolation. The template context includes all `pkg` fields and the release context (`flags`, `git`, `env`, etc):
```json
{
  "buildCmd": "yarn build --pkg=${{name}} --ver=${{version}}",
  "testCmd": "yarn test --scope=${{name}}",
  "publishCmd": "echo releasing ${{name}}@${{version}}"
}
```
Available variables include: `name`, `version`, `absPath`, `relPath`, and anything from `pkg.ctx` (e.g. `git.sha`, `git.root`, `flags.*`).

#### Changelog diff URLs
By default, changelog entries link to GitHub compare/commit pages. Override `diffTagUrl` and `diffCommitUrl` to customize for other platforms (e.g. Gerrit):
```json
{
  "diffTagUrl": "https://gerrit.foo.com/plugins/gitiles/${repoName}/+/refs/tags/${newTag}",
  "diffCommitUrl": "https://gerrit.foo.com/plugins/gitiles/${repoName}/+/${hash}%5E%21"
}
```
Available variables: `repoName`, `repoPublicUrl`, `prevTag`, `newTag`, `name`, `version`, `hash`, `short`.

#### GitHub Enterprise
Set `ghUrl` to point to your GHE instance. API URL (`ghApiUrl`) is derived automatically.
```json
{
  "ghUrl": "https://ghe.corp.com"
}
```
Or via env: `GH_URL=https://ghe.corp.com` / `GITHUB_URL=https://ghe.corp.com`.

### env vars
```js
export const parseEnv = (env = process.env) => {
  const {GH_USER, GH_USERNAME, GITHUB_USER, GITHUB_USERNAME, GH_TOKEN, GITHUB_TOKEN, GH_URL, GITHUB_URL, NPM_TOKEN, NPM_REGISTRY, NPMRC, NPM_USERCONFIG, NPM_CONFIG_USERCONFIG, NPM_PROVENANCE, NPM_OIDC, ACTIONS_ID_TOKEN_REQUEST_URL, GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL} = env

  return {
    ghUser:             GH_USER || GH_USERNAME || GITHUB_USER || GITHUB_USERNAME || 'x-access-token',
    ghToken:            GH_TOKEN || GITHUB_TOKEN,
    ghUrl:              GH_URL || GITHUB_URL || 'https://github.com',
    npmToken:           NPM_TOKEN,
    // npmConfig suppresses npmToken
    npmConfig:          NPMRC || NPM_USERCONFIG || NPM_CONFIG_USERCONFIG,
    npmRegistry:        NPM_REGISTRY || 'https://registry.npmjs.org',
    npmProvenance:      NPM_PROVENANCE,
    // OIDC trusted publishing: https://docs.npmjs.com/trusted-publishers/
    npmOidc:            NPM_OIDC || (!NPM_TOKEN && ACTIONS_ID_TOKEN_REQUEST_URL),
    gitCommitterName:   GIT_COMMITTER_NAME || 'Semrel Extra Bot',
    gitCommitterEmail:  GIT_COMMITTER_EMAIL || 'semrel-extra-bot@hotmail.com',
  }
}
```

### OIDC Trusted Publishing
npm now supports [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers/) as a replacement for long-lived access tokens. To enable:
1. [Configure a trusted publisher](https://docs.npmjs.com/trusted-publishers/) for each package on npmjs.com (link your GitHub repo and workflow)
2. Set `NPM_OIDC=true` in your workflow environment
3. Ensure your GitHub Actions workflow has `permissions: { id-token: write }`
4. Make sure each `package.json` includes the `repository` field matching your GitHub repo URL

OIDC mode is also auto-detected when `NPM_TOKEN` is not set and `ACTIONS_ID_TOKEN_REQUEST_URL` is present (GitHub Actions with `id-token: write` permission).

When OIDC is active, `NPM_TOKEN` and `NPMRC` are ignored for publishing and `--provenance` is enabled automatically.

### Snapshot releases from PRs
The `--snapshot` flag publishes packages to the `snapshot` npm dist-tag with a pre-release version like `1.2.1-snap.a3f0c12`. This is useful for testing changes from a feature branch before merging.

**What snapshot does differently:**
- Version gets a `-snap.<short-sha>` suffix instead of a clean bump
- Git release tags are **not** pushed
- Only `npm` and `publishCmd` channels run (no gh-release, no changelog, no gh-pages, no meta)
- npm tag is `snapshot` instead of `latest`

**Workflow example** (`.github/workflows/snapshot.yml`):
```yaml
name: Snapshot
on:
  pull_request:
    types: [labeled]

jobs:
  snapshot:
    if: github.event.label.name == 'snapshot'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write    # for OIDC trusted publishing
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: yarn install
      - run: npx zx-bulk-release --snapshot
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**How to use:**
1. Push a feature branch and open a PR.
2. Add the `snapshot` label to the PR.
3. The workflow publishes snapshot versions to npm.
4. Consumers install snapshots via `npm install yourpkg@snapshot`.
5. After merge, the regular release flow on `master` publishes clean versions to `latest`.

### Selective testing along the change graph
In a monorepo, `--dry-run` combined with `--no-build` lets you run tests only for packages affected by the current changes — following the dependency graph, without publishing anything. This gives you a precise CI check scoped to what actually changed:
```shell
npx zx-bulk-release --dry-run --no-build
```
See [antongolub/misc](https://github.com/antongolub/misc) for a real-world example of this pattern.

## Demo
* [demo-zx-bulk-release](https://github.com/semrel-extra/demo-zx-bulk-release)
* [qiwi/pijma](https://github.com/qiwi/pijma)
* [antongolub/misc](https://github.com/antongolub/misc)

## Implementation notes
### Architecture
The release pipeline is split into three subsystems under `post/`:

```
post/
  depot/     — preparation: analysis, versioning, building, testing, tar packing
  courier/   — sealed delivery: receives self-describing tars and delivers through channels
  api/       — shared infrastructure wrappers (git, npm, gh)
```

This separation ensures that courier never touches the project directory — it works only with pre-packed tars and credentials resolved at delivery time. The two subsystems can run in separate CI jobs with different privilege levels.

### Flow
```
topo ─► contextify ─► analyze ──► build ──► test ──► pack ──► publish ─► clean
         (per pkg)    (per pkg)   (per pkg)  (per pkg) (per pkg) (per pkg)
```
[`@semrel-extra/topo`](https://github.com/semrel-extra/topo) resolves the release queue respecting dependency graphs. The graph allows parallel execution where the dependency tree permits; `memoizeBy` prevents duplicate work when a package is reached by multiple paths.

By default, packages marked as `private` are omitted. Override with `--include-private`.

### Steps
Each step has a uniform signature `(pkg, ctx)`:
- **`contextify`** — resolves per-package config, latest release metadata, and git context.
- **`analyze`** — determines semantic changes, release type, and next version.
- **`build`** — runs `buildCmd` (with dep traversal and optional npm artifact fetch).
- **`test`** — runs `testCmd`.
- **`pack`** — stages delivery artifacts into self-describing tar containers (`npm pack`, docs copy, assets, release notes). Each tar is named `{tag}.{channel}.{hash8}.tar` and contains a `manifest.json` with channel name, delivery instructions, and template credentials (`${{ENV_VAR}}`). After this step, everything the courier needs is outside the project dir.
- **`publish`** — pushes the release tag (commitment point), hands tars to courier's `deliver()`, runs `cmd` channel separately.
- **`clean`** — restores `package.json` files and unsets git user config.

Set `config.releaseRules` to override the default rules preset:
```js
[
  {group: 'Features', releaseType: 'minor', prefixes: ['feat']},
  {group: 'Fixes & improvements', releaseType: 'patch', prefixes: ['fix', 'perf', 'refactor', 'docs', 'patch']},
  {group: 'BREAKING CHANGES', releaseType: 'major', keywords: ['BREAKING CHANGE', 'BREAKING CHANGES']},
]
```

### Tar containers
Each delivery artifact is a self-describing tar archive:
```
{tag}.{channel}.{hash8}.tar
  manifest.json    — channel name, delivery params, template credentials
  package.tgz     — (npm channel) npm tarball
  assets/          — (gh-release channel) release assets
  docs/            — (gh-pages channel) documentation files
```

The manifest contains `${{ENV_VAR}}` placeholders that are resolved by the courier at delivery time via `resolveManifest()`. This ensures credentials never touch the build phase.

### Channels
Delivery channels are a registry of `{name, when, prepare?, run, requires?, snapshot?, transport?}` objects:
- **meta** — pushes release metadata to the `meta` branch (or as a GH release asset).
- **npm** — publishes to the npm registry.
- **gh-release** — creates a GitHub release with optional file assets.
- **gh-pages** — pushes docs to a `gh-pages` branch.
- **changelog** — pushes a changelog entry to a `changelog` branch.
- **cmd** — runs a custom `publishCmd` (depot-side, not through courier; `transport: false`).

Each channel declares `requires` — a list of manifest fields that must be present after credential resolution. Courier validates all parcels before running any channel (fail-fast).

### Credential flow
```
depot (build phase)                          courier (deliver phase)
  manifest: { token: '${{NPM_TOKEN}}' }  →    resolveManifest(manifest, env)
                                                 → { token: 'actual-secret' }
```
Template credentials (`${{ENV_VAR}}`) are written into manifests at pack time. Courier resolves them from `process.env` at delivery time. This means the build phase never sees real secrets.

### Tags
[Lerna](https://github.com/lerna/lerna) tags (like `@pkg/name@v1.0.0-beta.0`) are suitable for monorepos, but they don't follow [semver spec](https://semver.org/). Therefore, we propose another contract:
```js
'2022.6.13-optional-org.pkg-name.v1.0.0-beta.1+sha.1-f0'
// date    name                  version             format
```
Note, [npm-package-name charset](https://www.npmjs.com/package/validate-npm-package-name) is wider than [semver](https://semver.org/spec/v2.0.0.html#spec-item-4), so we need a pinch of [base64url magic](https://stackoverflow.com/questions/55389211/string-based-data-encoding-base64-vs-base64url) for some cases.
```js
'2022.6.13-examplecom.v1.0.0.ZXhhbXBsZS5jb20-f1'
// date    name       ver    b64             format
```
Anyway, it's still possible to override the default config by `tagFormat` option:

| tagFormat | Example                                              |
|-----------|------------------------------------------------------|
| f0        | 2022.6.22-qiwi.pijma-native.v1.0.0-beta.0+foo.bar-f0 |
| f1        | 2022.6.13-examplecom.v1.0.0.ZXhhbXBsZS5jb20-f1       |
| lerna     | @qiwi/pijma-ssr@1.1.12                               |
| pure      | 1.2.3-my.package                                     | 


### Meta
Each release gathers its own meta. It is _recommended_ to store the data somehow to ensure flow reliability.: 
* Set `meta: {type: 'asset'}` to persist as gh asset.
* If set `meta: {type: null}` the required data will be fetched from the npm artifact.
* Otherwise, it will be pushed as a regular git commit to the `meta` branch (default behaviour).

`2022-6-26-semrel-extra-zxbr-test-c-1-3-1-f0.json`
```json
{
  "META_VERSION": "1",
  "name": "@semrel-extra/zxbr-test-c",
  "hash": "07b7df33f0159f674c940bd7bbb2652cdaef5207",
  "version": "1.3.1",
  "dependencies": {
    "@semrel-extra/zxbr-test-a": "^1.4.0",
    "@semrel-extra/zxbr-test-d": "~1.2.0"
  }
}
```

### Report

Release process state is reported to the console and to a file if `--report` flag is set to `/some/path/release-report.json`, for example.
```js
{
  status: 'success',            // 'sucess' | 'failure' | 'pending'
  error: null,                  // null or Error
  queue: ['a', 'b', 'c', 'd']   // release queue
  packages: [{
    name: 'a',
    version: '1.1.0',
    path: '/pkg/abs/path',
    relPath: 'pkg/rel/path',
    config: {                   // pkg config
      changelog: 'changelog',
      npmFetch: true
    },                 
    changes: [{                 // semantic changes
      group: 'Features',
      releaseType: 'minor',
      change: 'feat: add feat',
      subj: 'feat: add feat',
      body: '',
      short: '792512c',
      hash: '792512cccd69c6345d9d32d3d73e2591ea1776b5'
    }],                  
    tag: {
      version: 'v1.1.0',
      name: 'a',
      ref: '2022.6.22-a.v1.1.0-f0'
    },
    releaseType: 'minor',       // 'major' | 'minor' | 'patch'
    prevVersion: '1.0.0'        // previous version or null
  }, {
    name: 'b',
    // ...
  }],
  events: [
    {msg: ['zx-bulk-release'], scope:'~', date: 1665839585488, level: 'info'},
    {msg: ['queue:',['a','b']], scope:'~', date: 1665839585493, level: 'info'},
    {msg: ["run buildCmd 'yarn && yarn build && yarn test'"], scope: 'a', date: 1665839585719, level:'info'},
    // ...
  ]
}
```

### Output
[Compact and clear logs](https://github.com/semrel-extra/demo-zx-bulk-release/runs/7090161341?check_suite_focus=true#step:6:1)

```shell
Run npm_config_yes=true npx zx-bulk-release
zx-bulk-release
[@semrel-extra/zxbr-test-a] semantic changes [
  {
    group: 'Fixes & improvements',
    releaseType: 'patch',
    change: 'fix(a): random',
    subj: 'fix(a): random',
    body: '',
    short: '6ff25bd',
    hash: '6ff25bd421755b929ef2b58f35c727670fd93849'
  }
]
[@semrel-extra/zxbr-test-a] run cmd 'yarn && yarn build && yarn test'
[@semrel-extra/zxbr-test-a] push release tag 2022.6.27-semrel-extra.zxbr-test-a.1.8.1-f0
[@semrel-extra/zxbr-test-a] push artifact to branch 'meta'
[@semrel-extra/zxbr-test-a] push changelog
[@semrel-extra/zxbr-test-a] publish npm package @semrel-extra/zxbr-test-a 1.8.1 to https://registry.npmjs.org
[@semrel-extra/zxbr-test-a] create gh release
[@semrel-extra/zxbr-test-b] semantic changes [
  {
    group: 'Dependencies',
    releaseType: 'patch',
    change: 'perf',
    subj: 'perf: @semrel-extra/zxbr-test-a updated to 1.8.1'
  }
]
[@semrel-extra/zxbr-test-b] run cmd 'yarn && yarn build && yarn test'
[@semrel-extra/zxbr-test-b] push release tag 2022.6.27-semrel-extra.zxbr-test-b.1.3.5-f0
[@semrel-extra/zxbr-test-b] push artifact to branch 'meta'
[@semrel-extra/zxbr-test-b] push changelog
[@semrel-extra/zxbr-test-b] publish npm package @semrel-extra/zxbr-test-b 1.3.5 to https://registry.npmjs.org
[@semrel-extra/zxbr-test-b] create gh release
[@semrel-extra/zxbr-test-d] semantic changes [
```

## References
* [semrel-extra/zx-semrel](https://github.com/semrel-extra/zx-semrel)
* [dhoulb/multi-semantic-release](https://github.com/dhoulb/multi-semantic-release)
* [semantic-release/semantic-release](https://github.com/semantic-release/semantic-release)
* [conventional-changelog/releaser-tools](https://github.com/conventional-changelog/releaser-tools)
* [pmowrer/semantic-release-monorepo](https://github.com/pmowrer/semantic-release-monorepo)
* [bubkoo/semantic-release-monorepo](https://github.com/bubkoo/semantic-release-monorepo)
* [ext/semantic-release-lerna](https://github.com/ext/semantic-release-lerna)
* [jscutlery/semver](https://github.com/jscutlery/semver)
* [microsoft/rushstack](https://github.com/microsoft/rushstack) / [rushjs.io](https://rushjs.io/)
* [tophat/monodeploy](https://github.com/tophat/monodeploy)
* [intuit/auto](https://github.com/intuit/auto)
* [vercel/turborepo](https://github.com/vercel/turborepo)
* [lerna/lerna](https://github.com/lerna/lerna)
* [nrwl/nx](https://github.com/nrwl/nx)
* [moonrepo/moon](https://github.com/moonrepo/moon)
* [ojkelly/yarn.build](https://github.com/ojkelly/yarn.build)
* [antfu/bumpp](https://github.com/antfu/bumpp)
* [googleapis/release-please](https://github.com/googleapis/release-please)
* [generic-semantic-version-processing](https://about.gitlab.com/blog/2021/09/28/generic-semantic-version-processing/)
* [jchip/fynpo](https://github.com/jchip/fynpo)
* [lerna-lite/lerna-lite](https://github.com/lerna-lite/lerna-lite)

## License 
[MIT](./LICENSE)
