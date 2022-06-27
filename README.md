# zx-bulk-release
> [zx](https://github.com/google/zx)-based alternative for [multi-semantic-release](https://github.com/dhoulb/multi-semantic-release)

[![CI](https://github.com/semrel-extra/zx-bulk-release/workflows/CI/badge.svg)](https://github.com/semrel-extra/zx-bulk-release/actions)
[![Maintainability](https://api.codeclimate.com/v1/badges/bb94e929b1b6430781b5/maintainability)](https://codeclimate.com/github/semrel-extra/zx-bulk-release/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/bb94e929b1b6430781b5/test_coverage)](https://codeclimate.com/github/semrel-extra/zx-bulk-release/test_coverage)

🚧 Work in progress. Early access preview

## Key features
* [Conventional commits](https://www.conventionalcommits.org/en/v1.0.0/#specification) trigger semantic releases.
* Automated cross-pkg version bumping.
* Predictable [toposort](https://githib.com/semrel-extra/topo)-driven flow.
* No default branch blocking (no release commits).
* Pkg changelogs go to `changelog` branch (configurable).
* Docs are published to `gh-pages` branch (configurable).
* No extra builds. The required deps are fetched from the pkg registry (`npmFetch` flag).

## Requirements
* macOS / linux
* Node.js >= 16.0.0
* npm >=7 / yarn >= 3

## Usage
### CLI
```shell
GH_TOKEN=ghtoken GH_USER=username NPM_TOKEN=npmtoken npx zx-bulk-release [opts]
```

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

### Config
Any [cosmiconfig](https://github.com/davidtheclark/cosmiconfig) compliant format: `.releaserc`, `.release.json`, `.release.yaml`, etc.
```json
{
  "cmd": "yarn && yarn build && yarn test",
  "npmFetch": true,
  "changelog": "changelog",
  "ghPages": "gh-pages"
}
```

### Demo
* [demo-zx-bulk-release](https://github.com/semrel-extra/demo-zx-bulk-release)
* [qiwi/pijma](https://github.com/qiwi/pijma)

## Implementation notes
### Tags
[Lerna](https://github.com/lerna/lerna) tags (like `@pkg/name@v1.0.0-beta.0`) are suitable for monorepos, but they don’t follow [semver spec](https://semver.org/). Therefore, we propose another contract:
```js
'2022.6.13-optional-org.pkg-name.v1.0.0-beta.1+sha.1-f0'
// date    name                  version             format
```
Note, [npm-package-name charset](https://www.npmjs.com/package/validate-npm-package-name) is wider than [semver](https://semver.org/spec/v2.0.0.html#spec-item-4), so we need a pinch of [base64url magic](https://stackoverflow.com/questions/55389211/string-based-data-encoding-base64-vs-base64url) for some cases.
```js
'2022.6.13-examplecom.v1.0.0.ZXhhbXBsZS5jb20-f1'
// date    name       ver    b64             format
```

### env vars
```js
export const parseEnv = (env = process.env) => {
  const {GH_USER, GH_USERNAME, GITHUB_USER, GITHUB_USERNAME, GH_TOKEN, GITHUB_TOKEN, NPM_TOKEN, NPM_REGISTRY, NPMRC, NPM_USERCONFIG, NPM_CONFIG_USERCONFIG, GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL} = env

  return {
    ghUser: GH_USER || GH_USERNAME || GITHUB_USER || GITHUB_USERNAME,
    ghToken: GH_TOKEN || GITHUB_TOKEN,
    npmToken: NPM_TOKEN,
    // npmConfig suppresses npmToken
    npmConfig: NPMRC || NPM_USERCONFIG || NPM_CONFIG_USERCONFIG,
    npmRegistry: NPM_REGISTRY || 'https://registry.npmjs.org',
    gitCommitterName: GIT_COMMITTER_NAME || 'Semrel Extra Bot',
    gitCommitterEmail: GIT_COMMITTER_EMAIL || 'semrel-extra-bot@hotmail.com',
  }
}
```

### Meta

Each release projects its result into the `meta` branch.  
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

## References
* [semrel-extra/zx-semrel](https://github.com/semrel-extra/zx-semrel)
* [dhoulb/multi-semantic-release](https://github.com/dhoulb/multi-semantic-release)
* [semantic-release/semantic-release](https://github.com/semantic-release/semantic-release)
* [conventional-changelog/releaser-tools](https://github.com/conventional-changelog/releaser-tools)
* [pmowrer/semantic-release-monorepo](https://github.com/pmowrer/semantic-release-monorepo)
* [jscutlery/semver](https://github.com/jscutlery/semver)
* [tophat/monodeploy](https://github.com/tophat/monodeploy)
* [intuit/auto](https://github.com/intuit/auto)
* [vercel/turborepo](https://github.com/vercel/turborepo)
* [lerna/lerna](https://github.com/lerna/lerna)
* [nrwl/nx](https://github.com/nrwl/nx)

## License 
[MIT](./LICENSE)
