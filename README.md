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
* Semantic commits trigger semantic releases
* Predictable [toposort](https://githib.com/semrel-extra/topo)-driven flow
* No blocking (no release commits)
* Changelogs, docs, bundles go to: release assets and/or metabranch.
* No extra builds. Required pgks are attempted to fetch from registry / metabranch / release assets at first

## License 
[MIT](./LICENSE)
