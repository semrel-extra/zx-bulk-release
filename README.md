# zx-bulk-release
> [zx](https://github.com/google/zx)-based alternative for [multi-semantic-release](https://github.com/dhoulb/multi-semantic-release)

🚧 Work in progress. Early access preview

## Requirements
* macOS / linux
* Node.js >= 16.0.0
* yarn >= 4.0.0-rc.5

## Usage
```shell
GH_TOKEN=ghtoken GH_USER=username NPM_TOKEN=npmtoken npx zx-bulk-release [opts]
```

## Roadmap
* [x] [Conventional commits](https://www.conventionalcommits.org/en/v1.0.0/#specification) trigger semantic releases.
* [x] Predictable [toposort](https://githib.com/semrel-extra/topo)-driven flow.
* [x] No blocking (no release commits).
* [ ] Changelogs, docs, bundles go to: release assets and/or meta branch.
* [x] No extra builds. The required deps are fetched from the pkg registry.

## Tags
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

## JS API
```js
import { run } from 'zx-bulk-release'

const cwd = '/foo/bar' // Defaults to process.cwd()
const env = { GH_TOKEN: 'foo', NPM_TOKEN: 'bar' } // Defaults to process.env
const flags = {dryRun: true}

await run({cwd, flags, env})
```

## env vars
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

## References
* [semrel-extra/zx-semrel](https://github.com/semrel-extra/zx-semrel)
* [dhoulb/multi-semantic-release](https://github.com/dhoulb/multi-semantic-release)
* [semantic-release/semantic-release](https://github.com/semantic-release/semantic-release)
* [tophat/monodeploy](https://github.com/tophat/monodeploy)
* [conventional-changelog/releaser-tools](https://github.com/conventional-changelog/releaser-tools)
* [pmowrer/semantic-release-monorepo](https://github.com/pmowrer/semantic-release-monorepo)
* [jscutlery/semver](https://github.com/jscutlery/semver)
* [intuit/auto](https://github.com/intuit/auto)

## License 
[MIT](./LICENSE)
