# zx-bulk-release
> [zx](https://github.com/google/zx)-based alternative for [multi-semantic-release](https://github.com/dhoulb/multi-semantic-release)

## Usage
```shell
GH_TOKEN=foo NPM_TOKEN=bar npx zx-bulk-release [opts]
```

or just copy-paste, tweak a bit and run with [zx-extra](https://github.com/qiwi/zx-extra):
```shell
GH_TOKEN=foo NPM_TOKEN=bar zx-extra zx-bulk-release.mjs
```

## Roadmap
* [x] [Semantic commits](https://www.conventionalcommits.org/en/v1.0.0/#specification) trigger releases.
* [x] Predictable [toposort](https://githib.com/semrel-extra/topo)-driven flow.
* [x] No blocking (no release commits).
* [ ] Changelogs, docs, bundles go to: release assets and/or meta branch.
* [ ] No extra builds. Required deps are fetched from registry / meta branch / release assets.

## Tags
[Lerna](https://github.com/lerna/lerna) tags (like `@pkg/name@v1.0.0-beta.0`) are suitable for monorepos, but they don’t follow [semver spec](https://semver.org/). Therefore, we propose another contract: 
```js
'2022.6.13-optional-org.pkg-name.v1.0.0-beta.1+sha.1-f0'
// date    name                  version             format                              
```
Note, [npm-package-name charset](https://www.npmjs.com/package/validate-npm-package-name) is wider than [semver](https://semver.org/spec/v2.0.0.html#spec-item-4), so we need a pinch of [base64url magic](https://stackoverflow.com/questions/55389211/string-based-data-encoding-base64-vs-base64url).

## References
* [semrel-extra/zx-semrel](https://github.com/semrel-extra/zx-semrel)
* [dhoulb/multi-semantic-release](https://github.com/dhoulb/multi-semantic-release)
* [semantic-release/semantic-release](https://github.com/semantic-release/semantic-release)
* [tophat/monodeploy](https://github.com/tophat/monodeploy)
* [conventional-changelog/releaser-tools](https://github.com/conventional-changelog/releaser-tools)
* [pmowrer/semantic-release-monorepo](https://github.com/pmowrer/semantic-release-monorepo)

## License 
[MIT](./LICENSE)
