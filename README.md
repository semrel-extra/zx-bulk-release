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

## Key features
* [Semantic commits](https://www.conventionalcommits.org/en/v1.0.0/#specification) trigger releases.
* Predictable [toposort](https://githib.com/semrel-extra/topo)-driven flow.
* No blocking (no release commits).
* Changelogs, docs, bundles go to: release assets and/or metabranch.
* No extra builds. Required deps are fetched from registry / metabranch / release assets.

## Tags
[Lerna](https://github.com/lerna/lerna) tags (like `@pkg/name@v1.0.0-beta.0`) are suitable for monorepos, but they don’t follow [semver spec](https://semver.org/). Therefore, we propose to introduce another contract: 
```js
'2022.6.13-optional-org-name.pkg-name.v1.0.0-beta.1+sha.1'
// date    org               pkg      version
```

## References
* [semrel-extra/zx-semrel](https://github.com/semrel-extra/zx-semrel)
* [dhoulb/multi-semantic-release](https://github.com/dhoulb/multi-semantic-release)
* [semantic-release/semantic-release](https://github.com/semantic-release/semantic-release)
* [tophat/monodeploy](https://github.com/tophat/monodeploy)
* [conventional-changelog/releaser-tools](https://github.com/conventional-changelog/releaser-tools)
* [pmowrer/semantic-release-monorepo](https://github.com/pmowrer/semantic-release-monorepo)

## License 
[MIT](./LICENSE)
