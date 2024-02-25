## [2.15.3](https://github.com/semrel-extra/zx-bulk-release/compare/v2.15.2...v2.15.3) (2024-02-25)

### Fixes & improvements
* refactor: add util pipify ([2d5ce43](https://github.com/semrel-extra/zx-bulk-release/commit/2d5ce4382acd5c1ea9517177fb3bc3f39345a55b))

## [2.15.2](https://github.com/semrel-extra/zx-bulk-release/compare/v2.15.1...v2.15.2) (2024-02-25)

### Fixes & improvements
* perf: update zx-extra to v2.6.7 ([c910cbb](https://github.com/semrel-extra/zx-bulk-release/commit/c910cbb3bb188dd01815281e3c82512d6cbc80a3))

## [2.15.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.15.0...v2.15.1) (2024-02-09)

### Fixes & improvements
* perf: apply npmRestore to updated pkgs only ([daa4080](https://github.com/semrel-extra/zx-bulk-release/commit/daa4080f402a4a68ce97e21089dde98995c23486))

## [2.15.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.14.0...v2.15.0) (2024-02-08)

### Features
* feat: separate test and build steps ([3024a60](https://github.com/semrel-extra/zx-bulk-release/commit/3024a601adc7e2e819149c01c29d813d4467947a))

## [2.14.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.13.3...v2.14.0) (2023-12-19)

### Features
* feat: log commit delta from initial if another from ref is not specified ([e04e236](https://github.com/semrel-extra/zx-bulk-release/commit/e04e236a703c24e462a0e500d2232d4509028101))

## [2.13.3](https://github.com/semrel-extra/zx-bulk-release/compare/v2.13.2...v2.13.3) (2023-12-19)

### Fixes & improvements
* fix: getLatestMeta fallbacks to npm manifest ([eae8771](https://github.com/semrel-extra/zx-bulk-release/commit/eae877103df33b6b96d20924f7ff8cd4825b8877))

## [2.13.2](https://github.com/semrel-extra/zx-bulk-release/compare/v2.13.1...v2.13.2) (2023-12-19)

### Fixes & improvements
* perf: tweak up getCommits ([9206508](https://github.com/semrel-extra/zx-bulk-release/commit/9206508cdafbfd166734c804b4c68fe861de1f02))

## [2.13.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.13.0...v2.13.1) (2023-12-18)

### Fixes & improvements
* perf: update toposource ([539d55d](https://github.com/semrel-extra/zx-bulk-release/commit/539d55dbd660d651acee1c5939eb5f4e626c1d17))

## [2.13.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.12.2...v2.13.0) (2023-12-05)

### Fixes & improvements
* fix: avoid polynomial regex on flags parsing ([c080fb8](https://github.com/semrel-extra/zx-bulk-release/commit/c080fb8246d71ad5e366ae6931b06db3ff86233b))
* fix: sanitize paths on extract ([3f67b9f](https://github.com/semrel-extra/zx-bulk-release/commit/3f67b9f89b44589930c5dcce96237c0c5c3294f1))
* refactor: decompose processor.js ([a498a7f](https://github.com/semrel-extra/zx-bulk-release/commit/a498a7f5900396e42b6b2a6478028e128ab6ec1f))
* fix: throw error if declared gh asset is empty ([d2dc6f6](https://github.com/semrel-extra/zx-bulk-release/commit/d2dc6f6b457a3178671b0d6349d42234b8052c7e))
* fix: handle empty files collection on gh assets push ([c9dbb5b](https://github.com/semrel-extra/zx-bulk-release/commit/c9dbb5bf3c5b4ff4ce11603e541feae784574f10))
* perf: replace external `curl`, `wget` and `tar` with node `fetch` and `tar-stream` ([496c73b](https://github.com/semrel-extra/zx-bulk-release/commit/496c73b68172c42e5930d185f1008d487928e7fc))

### Features
* feat: configurable meta push ([0042af3](https://github.com/semrel-extra/zx-bulk-release/commit/0042af34d31ff6d3783c3953ece167a9dc78fb45))
* feat: let release meta be published as gh assets ([3d333e1](https://github.com/semrel-extra/zx-bulk-release/commit/3d333e1fb6d61adb5bd05ac3a90e19a3a5402843))

## [2.12.2](https://github.com/semrel-extra/zx-bulk-release/compare/v2.12.1...v2.12.2) (2023-11-20)

### Fixes & improvements
* fix: fetch latest npm manifest by default ([e7e6c0d](https://github.com/semrel-extra/zx-bulk-release/commit/e7e6c0dfe0aef34c0cf6a6936cca1057aef8c746))
* fix: fix `pure` tag parser ([41b961d](https://github.com/semrel-extra/zx-bulk-release/commit/41b961d7eed99061fcc851b7b8ed7fc72813ef46))

## [2.12.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.12.0...v2.12.1) (2023-11-02)

### Fixes & improvements
* docs: fixes a broken link in README ([4b02a4d](https://github.com/semrel-extra/zx-bulk-release/commit/4b02a4db49a19b493c790f32096c34c82f90536a))

## [2.12.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.11.7...v2.12.0) (2023-09-19)

### Features
* feat: provide `tagFormat` configuration ([c405454](https://github.com/semrel-extra/zx-bulk-release/commit/c4054545da55b430e427ab8b8684a305a1dd8360))

## [2.11.7](https://github.com/semrel-extra/zx-bulk-release/compare/v2.11.6...v2.11.7) (2023-09-19)

### Fixes & improvements
* perf: up deps ([ae0d80a](https://github.com/semrel-extra/zx-bulk-release/commit/ae0d80ac82b3fc49c2fc046b4b52bc17ea24f466))
* perf: add `npmPersist` helper with debug notice ([3790f4d](https://github.com/semrel-extra/zx-bulk-release/commit/3790f4dbed97e52bc937bedfacac69ce4acb5529))

## [2.11.6](https://github.com/semrel-extra/zx-bulk-release/compare/v2.11.5...v2.11.6) (2023-09-19)

### Fixes & improvements
* docs: mention generic-semantic-version-processing ([f9e1750](https://github.com/semrel-extra/zx-bulk-release/commit/f9e175094910f8fb27f5bed137b2a54aa5a7bdce))

## [2.11.5](https://github.com/semrel-extra/zx-bulk-release/compare/v2.11.4...v2.11.5) (2023-07-07)

### Fixes & improvements
* fix(assets): handle `commonPath` corner case ([1e9ac5e](https://github.com/semrel-extra/zx-bulk-release/commit/1e9ac5e64ac1c26a049f28b35c7c98db5bea7d34))

## [2.11.4](https://github.com/semrel-extra/zx-bulk-release/compare/v2.11.3...v2.11.4) (2023-06-29)

### Fixes & improvements
* fix: do not try to fetch private packages ([a6889bb](https://github.com/semrel-extra/zx-bulk-release/commit/a6889bb45e2bd05f82a05d20c4153baa5c6f1ab3))

## [2.11.3](https://github.com/semrel-extra/zx-bulk-release/compare/v2.11.2...v2.11.3) (2023-06-27)

### Fixes & improvements
* fix: apply dir strip to tar inners ([3f5ccd8](https://github.com/semrel-extra/zx-bulk-release/commit/3f5ccd89134331604859969c8d10887d27d9aa6f))

## [2.11.2](https://github.com/semrel-extra/zx-bulk-release/compare/v2.11.1...v2.11.2) (2023-06-27)

### Fixes & improvements
* fix: handle gh release `upload_url` ([c853ca4](https://github.com/semrel-extra/zx-bulk-release/commit/c853ca4b6978d73402d43c60c30de4523b3c2662))

## [2.11.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.11.0...v2.11.1) (2023-06-27)

### Fixes & improvements
* fix: pass pkg root to `ghAssets` resolver ([b0ba371](https://github.com/semrel-extra/zx-bulk-release/commit/b0ba371263544b7b4081481024fc94413c1a0409))

## [2.11.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.10.0...v2.11.0) (2023-06-27)

### Features
* feat: introduce gh assets uploader ([4967fd9](https://github.com/semrel-extra/zx-bulk-release/commit/4967fd9895db684c6832c6055a716c7c7eb1a313))

## [2.10.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.9.3...v2.10.0) (2023-06-27)

### Features
* feat: log `fetch`, `build` & `test` steps duration ([b7b3db3](https://github.com/semrel-extra/zx-bulk-release/commit/b7b3db3af378f3153f8ad8fa62eec79852da6c0b))

## [2.9.3](https://github.com/semrel-extra/zx-bulk-release/compare/v2.9.2...v2.9.3) (2023-06-27)

### Fixes & improvements
* perf: print gh release url in log ([08edaef](https://github.com/semrel-extra/zx-bulk-release/commit/08edaef76e67a7b7109c9fa1e1f0140f5e932d3b))

## [2.9.2](https://github.com/semrel-extra/zx-bulk-release/compare/v2.9.1...v2.9.2) (2023-06-10)

### Fixes & improvements
* fix: respect --no-prefixed flags ([57c42a9](https://github.com/semrel-extra/zx-bulk-release/commit/57c42a97718cb594da5c90199706a71919e49e1e))

## [2.9.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.9.0...v2.9.1) (2023-06-09)

### Fixes & improvements
* fix: set default build. cmd to `exit 0` ([23d8ee2](https://github.com/semrel-extra/zx-bulk-release/commit/23d8ee2f64f98ce0d8d4f57d97dbed1c4696a389))

## [2.9.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.8.0...v2.9.0) (2023-05-29)

### Features
* feat: introduce `-v` flag to print own version ([a921559](https://github.com/semrel-extra/zx-bulk-release/commit/a9215598aedb204136d3c28ef3f8c2a1cbebff54))

## [2.8.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.7.0...v2.8.0) (2023-05-25)

### Features
* feat: support bolt and pnpm monorepos via @semrel-extra/topo >= 1.11.0 ([a0f2af9](https://github.com/semrel-extra/zx-bulk-release/commit/a0f2af9d832516d14322953518bf5d8842ee14da))

## [2.7.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.6.1...v2.7.0) (2023-04-30)

### Fixes & improvements
* fix: fix `latestVersion` fallback value ([9d25129](https://github.com/semrel-extra/zx-bulk-release/commit/9d25129dcf41c74cdd2d0670e86d20a32f7734c0))

### Features
* feat: let `releaseRules` be configured via opts ([4ae4606](https://github.com/semrel-extra/zx-bulk-release/commit/4ae4606678d13cf619e36861ce889e4e73c8a370))

## [2.6.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.6.0...v2.6.1) (2023-04-21)

### Fixes & improvements
* docs: readme struct edits, mention `wget` and `git` as requirements ([2f76f12](https://github.com/semrel-extra/zx-bulk-release/commit/2f76f12b142a700dd53045fc4d268d6d8e64b721))

## [2.6.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.5.3...v2.6.0) (2023-04-21)

### Features
* feat: enable npm `--provenance` via `NPM_PROVENANCE` env var ([c61ff88](https://github.com/semrel-extra/zx-bulk-release/commit/c61ff88a47c3fee6102ea19de47cdcecdda8833d))

## [2.5.3](https://github.com/semrel-extra/zx-bulk-release/compare/v2.5.2...v2.5.3) (2023-04-13)

### Fixes & improvements
* perf: export meta utils (#25) ([9c682db](https://github.com/semrel-extra/zx-bulk-release/commit/9c682dbd987ba0dfce0c4d0e6754a8d4e73b47bc))

## [2.5.2](https://github.com/semrel-extra/zx-bulk-release/compare/v2.5.1...v2.5.2) (2023-04-11)

### Fixes & improvements
* perf: add `scope` to version bump commit msg tpl ([a671e59](https://github.com/semrel-extra/zx-bulk-release/commit/a671e59d5008440626e8f280fd9bfd0ac284f720))
* fix: let npmFetch be called w/o auth (dry-run mode) ([7008d19](https://github.com/semrel-extra/zx-bulk-release/commit/7008d19361cd2cdbd73df9420edd096fd4fda1a6))

## [2.5.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.5.0...v2.5.1) (2023-04-11)

### Fixes & improvements
* perf: set connect timeout for npmFetch ([ab5a4eb](https://github.com/semrel-extra/zx-bulk-release/commit/ab5a4eba2ce8ee1b4257eff7d048fc905ddd98d1))

## [2.5.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.4.2...v2.5.0) (2023-04-09)

### Features
* feat: respect `publishCmd` also with `--snapshot` flag ([50521d2](https://github.com/semrel-extra/zx-bulk-release/commit/50521d28220df2e98978dfaa76efb8a5346470d0))

## [2.4.2](https://github.com/semrel-extra/zx-bulk-release/compare/v2.4.1...v2.4.2) (2023-04-09)

### Fixes & improvements
* fix: make safe `git config unset` ([562083d](https://github.com/semrel-extra/zx-bulk-release/commit/562083d14ede6db93e0e19853aa8baf3a1e0f578))

## [2.4.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.4.0...v2.4.1) (2023-04-09)

### Fixes & improvements
* fix: revert pkg.json state after publishing asap ([7e28b3e](https://github.com/semrel-extra/zx-bulk-release/commit/7e28b3eb3f0685bbe2133a6a0a1103ff19edca18))

## [2.4.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.3.3...v2.4.0) (2023-04-09)

### Features
* feat: support npm preversions (snapshots) publishing ([3ad7df7](https://github.com/semrel-extra/zx-bulk-release/commit/3ad7df752f6085ca010bcb6e0b4ac31260ce512b))

## [2.3.3](https://github.com/semrel-extra/zx-bulk-release/compare/v2.3.2...v2.3.3) (2023-04-07)

### Fixes & improvements
* fix: use tmp for `.npmrc` creation ([06ae101](https://github.com/semrel-extra/zx-bulk-release/commit/06ae10187e4f1bdef30c6490ce03077b2ac8b44d))

## [2.3.2](https://github.com/semrel-extra/zx-bulk-release/compare/v2.3.1...v2.3.2) (2023-04-02)

### Fixes & improvements
* perf: update @semrel-extra/topo to v1.9.0 ([b6fcd15](https://github.com/semrel-extra/zx-bulk-release/commit/b6fcd15f449d1588522a68b9d51555d8966c925a))

## [2.3.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.3.0...v2.3.1) (2023-04-02)

### Fixes & improvements
* refactor: use `traverseQueue`, `traverseDeps` from @semrel-extra/topo ([70d6cf4](https://github.com/semrel-extra/zx-bulk-release/commit/70d6cf41fdfd1436b561f9eb1d94254408e6d6e5))

## [2.3.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.17...v2.3.0) (2023-03-28)

### Features
* feat: introduce `onlyWorkspaceDeps` flag to identify `workspace` deps as the only graph edges ([b4aa4b5](https://github.com/semrel-extra/zx-bulk-release/commit/b4aa4b5e81c7ecc6658bac53b2188727e087aed6))

## [2.2.17](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.16...v2.2.17) (2023-03-28)

### Fixes & improvements
* fix: tweak up pkg ver resolver ([af20c16](https://github.com/semrel-extra/zx-bulk-release/commit/af20c16c936f7cadb2f3c461d16edc6e7f34f942))

## [2.2.16](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.15...v2.2.16) (2023-03-28)

### Fixes & improvements
* fix: fix pkg version resolver ([0b7bd4b](https://github.com/semrel-extra/zx-bulk-release/commit/0b7bd4b765b87c4e05d7da838831006506e27e30))

## [2.2.15](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.14...v2.2.15) (2023-03-28)

### Fixes & improvements
* fix: apply queuefy to changelog push ([b8b353d](https://github.com/semrel-extra/zx-bulk-release/commit/b8b353d439916ac57f717a3d463c710702b00d4d))

## [2.2.14](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.13...v2.2.14) (2023-03-28)

### Fixes & improvements
* fix: apply memoize to git config ops ([b46bec0](https://github.com/semrel-extra/zx-bulk-release/commit/b46bec030e711f840f143392c64f6330e6588f8d))

## [2.2.13](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.12...v2.2.13) (2023-03-27)

### Fixes & improvements
* perf: republish as `bulk-release` ([7927df7](https://github.com/semrel-extra/zx-bulk-release/commit/7927df77eb5ac1898d7df1156f0ab17e42d26464))

## [2.2.12](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.11...v2.2.12) (2023-03-27)

### Fixes & improvements
* fix: fix git push ([5cc1d8f](https://github.com/semrel-extra/zx-bulk-release/commit/5cc1d8fb25a399a2c69e8fd990f1a6ee73011b28))

## [2.2.11](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.10...v2.2.11) (2023-03-25)

### Fixes & improvements
* perf: apply memoize to `gitRoot` ([4f3488b](https://github.com/semrel-extra/zx-bulk-release/commit/4f3488bd4a7faea756e7c5b6ad6e59bbdf81846b))

## [2.2.10](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.9...v2.2.10) (2023-03-24)

### Fixes & improvements
* fix: debug point for publish step ([c4eedf9](https://github.com/semrel-extra/zx-bulk-release/commit/c4eedf9ddbe2120961ffc5f55b723cbbdc41cef8))

## [2.2.9](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.8...v2.2.9) (2023-03-24)

### Fixes & improvements
* refactor: wrap git pushers with queuefy ([2e9355f](https://github.com/semrel-extra/zx-bulk-release/commit/2e9355f69724a8ba097024456cbe5a80f37ea2a7))

## [2.2.8](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.7...v2.2.8) (2023-03-24)

### Fixes & improvements
* fix: fix git-push-rebase-retry hook ([30df2f1](https://github.com/semrel-extra/zx-bulk-release/commit/30df2f1d25d43145343e47f2f96d4a00955d6b76))

## [2.2.7](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.6...v2.2.7) (2023-03-24)

### Fixes & improvements
* docs: describe more CLI flags ([6f7a053](https://github.com/semrel-extra/zx-bulk-release/commit/6f7a053ae2fe2da8fd71858b132ef4ac4d1456ad))
* refactor: move `topo` to ctx builder ([6fec83c](https://github.com/semrel-extra/zx-bulk-release/commit/6fec83c10dd76feb93a3148eb2c032c6eaa902f1))

## [2.2.6](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.5...v2.2.6) (2023-03-24)

### Fixes & improvements
* refactor: apply memoize to git utils ([ff8ff78](https://github.com/semrel-extra/zx-bulk-release/commit/ff8ff7840eb65171b7d69d45cafed944627bfd20))

## [2.2.5](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.4...v2.2.5) (2023-03-24)

### Fixes & improvements
* perf: print err.stack on process failure ([5f3271f](https://github.com/semrel-extra/zx-bulk-release/commit/5f3271fa4e85d6d8f0b23ad240c9d566fddf69be))

## [2.2.4](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.3...v2.2.4) (2023-03-24)

### Fixes & improvements
* fix: add debug notes ([3cf101b](https://github.com/semrel-extra/zx-bulk-release/commit/3cf101b3330a5b0415684d9c3b097bb1832b4365))

## [2.2.3](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.2...v2.2.3) (2023-03-24)

### Fixes & improvements
* fix: debug ([c1699e6](https://github.com/semrel-extra/zx-bulk-release/commit/c1699e6c7d8bbc180c4ef17dfdb9f25816814578))

## [2.2.2](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.1...v2.2.2) (2023-03-24)

### Fixes & improvements
* fix: fix gitPush retry ([268da72](https://github.com/semrel-extra/zx-bulk-release/commit/268da727036b0d3bf20b1ef10053440c5f56dad0))

## [2.2.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.2.0...v2.2.1) (2023-03-23)

### Fixes & improvements
* perf: make parallel internal `publish` tasks ([87f388e](https://github.com/semrel-extra/zx-bulk-release/commit/87f388ea2ff5cce96cca600903d80260f13f0908))
* refactor: improve internal reporter ([cc62df7](https://github.com/semrel-extra/zx-bulk-release/commit/cc62df762c0581db159ddd2fae8d90b085911884))

## [2.2.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.1.6...v2.2.0) (2023-03-23)

### Fixes & improvements
* fix: fix basicAuth tpl ([b6af2f5](https://github.com/semrel-extra/zx-bulk-release/commit/b6af2f51a2e13ddb5a3b6b1ef288595aae61e746))

### Features
* feat: inherit gh and npm creds from pkg release configs ([f07dd4f](https://github.com/semrel-extra/zx-bulk-release/commit/f07dd4fa0cf9d26942780ccf0c34406b345dae39))

## [2.1.6](https://github.com/semrel-extra/zx-bulk-release/compare/v2.1.5...v2.1.6) (2023-03-22)

### Fixes & improvements
* fix: fix memoized build recursion ([413f2bf](https://github.com/semrel-extra/zx-bulk-release/commit/413f2bfcf456f4fefdab527ebe09112b6f26057c))

## [2.1.5](https://github.com/semrel-extra/zx-bulk-release/compare/v2.1.4...v2.1.5) (2023-03-22)

### Fixes & improvements
* fix: add `--ignore-failed-read` tar flag ([096134d](https://github.com/semrel-extra/zx-bulk-release/commit/096134dec953023373109d559b519efea2f41ca5))

## [2.1.4](https://github.com/semrel-extra/zx-bulk-release/compare/v2.1.3...v2.1.4) (2023-03-22)

### Fixes & improvements
* fix: separate `buildCmd` & `testCmd` directives ([1112d5c](https://github.com/semrel-extra/zx-bulk-release/commit/1112d5c4b16a7a1020402f77a33780627952be87))

## [2.1.3](https://github.com/semrel-extra/zx-bulk-release/compare/v2.1.2...v2.1.3) (2023-03-22)

### Fixes & improvements
* refactor: simplify topo filter ([a69735c](https://github.com/semrel-extra/zx-bulk-release/commit/a69735cef0d6fed15ac8e1a10a3c0a7378b5874c))

## [2.1.2](https://github.com/semrel-extra/zx-bulk-release/compare/v2.1.1...v2.1.2) (2023-03-22)

### Fixes & improvements
* perf: reduce pkg fetch timeout ([6c5ddb8](https://github.com/semrel-extra/zx-bulk-release/commit/6c5ddb8977f2f1bf6f0aa316014269f0e6745f19))

## [2.1.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.1.0...v2.1.1) (2023-03-22)

### Fixes & improvements
* fix: fix tar opts ([6d17135](https://github.com/semrel-extra/zx-bulk-release/commit/6d1713521d1660a7d4085dc6a3a20f7c856e39db))

## [2.1.0](https://github.com/semrel-extra/zx-bulk-release/compare/v2.0.1...v2.1.0) (2023-03-22)

### Features
* feat: add memoize to avoid redundant builds ([151ea71](https://github.com/semrel-extra/zx-bulk-release/commit/151ea7118af3907aad73f395ac3fb2420e25b2c8))

## [2.0.1](https://github.com/semrel-extra/zx-bulk-release/compare/v2.0.0...v2.0.1) (2023-03-22)

### Fixes & improvements
* perf: optimize pkg fetch ([749ea0b](https://github.com/semrel-extra/zx-bulk-release/commit/749ea0b29f854e57a447f4cdefe06ab32acba497))

## [2.0.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.26.2...v2.0.0) (2023-03-21)

### Features
* feat: replace sequent flow with concurrent ([ec35d7e](https://github.com/semrel-extra/zx-bulk-release/commit/ec35d7e337e64369f0423b71008345177f3ac949))

### BREAKING CHANGES
* concurrent flow might cause throttling issues ([ec35d7e](https://github.com/semrel-extra/zx-bulk-release/commit/ec35d7e337e64369f0423b71008345177f3ac949))

## [1.26.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.26.1...v1.26.2) (2023-03-21)

### Fixes & improvements
* refactor: separate processor layer ([dae6b96](https://github.com/semrel-extra/zx-bulk-release/commit/dae6b9682cd7d283e4f776c69f30c5f50fe9fa41))

## [1.26.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.26.0...v1.26.1) (2023-02-08)

### Fixes & improvements
* fix: allow multiple scopes in prefix ([2df6cb7](https://github.com/semrel-extra/zx-bulk-release/commit/2df6cb7999bed91968693069b80adeeb29b3890a))

## [1.26.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.25.3...v1.26.0) (2023-01-17)

### Features
* feat: expose test-utils ([59e9708](https://github.com/semrel-extra/zx-bulk-release/commit/59e9708d9adde41ef1f1a53d044f944e40ef000e))

## [1.25.3](https://github.com/semrel-extra/zx-bulk-release/compare/v1.25.2...v1.25.3) (2023-01-12)

### Fixes & improvements
* fix: add relpath to report ([d67355c](https://github.com/semrel-extra/zx-bulk-release/commit/d67355c8aced32918a8ae078e5182ce2ce58b3b6))

## [1.25.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.25.1...v1.25.2) (2022-11-22)

### Fixes & improvements
* fix(deps): update dependency cosmiconfig to v8 ([1ea0184](https://github.com/semrel-extra/zx-bulk-release/commit/1ea01849f902c850f357a9f14490f73de4d8c2d6))

## [1.25.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.25.0...v1.25.1) (2022-10-18)

### Fixes & improvements
* perf: export getLatestTaggedVersion (#10) ([32a9db8](https://github.com/semrel-extra/zx-bulk-release/commit/32a9db8f6f8a1aec8f452e7a2e4bc6d56c77ecfa))

## [1.25.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.24.0...v1.25.0) (2022-10-17)

### Features
* feat: enaple zx-extra `preferLocal` flag for `runCmd` hooks ([2b3cad5](https://github.com/semrel-extra/zx-bulk-release/commit/2b3cad58484e68869e1f712ea26cd10870ef86ee))

## [1.24.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.23.0...v1.24.0) (2022-10-15)

### Features
* feat: add pkg.tag to report ([c3e6d76](https://github.com/semrel-extra/zx-bulk-release/commit/c3e6d76b9001f6935b17eac8496425ce519230e0))

### Fixes & improvements
* fix: fix report format ([274401c](https://github.com/semrel-extra/zx-bulk-release/commit/274401c8685469801258574c20ae3c4c94f6956f))

## [1.23.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.22.3...v1.23.0) (2022-10-14)

### Features
* feat: introduce reports ([443102c](https://github.com/semrel-extra/zx-bulk-release/commit/443102c6395adabef63e433ec1136d30dbe8fff4))

### Fixes & improvements
* refactor: introduce internal logger ([ede8d6d](https://github.com/semrel-extra/zx-bulk-release/commit/ede8d6df3612654f3d6e9d5997f1b579c8149f2b))
* perf: up depx ([372bab2](https://github.com/semrel-extra/zx-bulk-release/commit/372bab2639d8feabaf1153e2cb0576838edb556f))

## [1.22.3](https://github.com/semrel-extra/zx-bulk-release/compare/v1.22.2...v1.22.3) (2022-08-25)

### Fixes & improvements
* fix: fix commit analyzer regexp ([18f38a5](https://github.com/semrel-extra/zx-bulk-release/commit/18f38a5e7c95030d85bc5b3d47b49e0f9ba6164d))

## [1.22.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.22.1...v1.22.2) (2022-08-25)

### Fixes & improvements
* fix: fix commit scope regexp ([507885d](https://github.com/semrel-extra/zx-bulk-release/commit/507885d0a24042450f0e5a4728ffd060ea33a673))

## [1.22.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.22.0...v1.22.1) (2022-07-30)

### Fixes & improvements
* fix: fix commit msg chunks join ([e2a9299](https://github.com/semrel-extra/zx-bulk-release/commit/e2a9299c08c288f5fd8ff14575fcd841017dd3d6))

## [1.22.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.21.0...v1.22.0) (2022-07-30)

### Features
* feat: introduce pkg context ([b57d4b0](https://github.com/semrel-extra/zx-bulk-release/commit/b57d4b0d9c5bb4501e79c556f64aacfebb83458a))

## [1.21.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.20.1...v1.21.0) (2022-07-30)

### Features
* feat: introduce `debug` flag ([b3e384c](https://github.com/semrel-extra/zx-bulk-release/commit/b3e384c1f32f27b5babf1f7adac7154e5827c1fb))

## [1.20.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.20.0...v1.20.1) (2022-07-28)

### Fixes & improvements
* fix: swap git user.name and user.email values ([8595f1b](https://github.com/semrel-extra/zx-bulk-release/commit/8595f1b67344166a6b7c51e2b62e948f9f2f0dc5))

## [1.20.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.19.3...v1.20.0) (2022-07-20)

### Features
* feat: set custom env if passed ([8acd852](https://github.com/semrel-extra/zx-bulk-release/commit/8acd8524124d06f54ac54d113b7049fe6b778851))

## [1.19.3](https://github.com/semrel-extra/zx-bulk-release/compare/v1.19.2...v1.19.3) (2022-07-20)

### Fixes & improvements
* perf: use PAT instead of basic auth for api.github.com calls ([c153615](https://github.com/semrel-extra/zx-bulk-release/commit/c153615b145f934cd715dc1523bfa99070f1e60e))

## [1.19.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.19.1...v1.19.2) (2022-07-19)

### Fixes & improvements
* fix: subs ws refs in manifests ([b5cd3b8](https://github.com/semrel-extra/zx-bulk-release/commit/b5cd3b8368500f74cecc9d7e065aaeff01e70dfe))

## [1.19.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.19.0...v1.19.1) (2022-07-19)

### Fixes & improvements
* fix: fix workspace refs substitution ([9fed233](https://github.com/semrel-extra/zx-bulk-release/commit/9fed23332988a2dc5a08b1b4854a03998c17a6a4))

## [1.19.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.18.0...v1.19.0) (2022-07-18)

### Features
* feat: add optional `publishCmd` directive ([e3cb37c](https://github.com/semrel-extra/zx-bulk-release/commit/e3cb37c1c7eff7e16fab5ac57a5ae28d7e2e1f57))

## [1.18.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.17.7...v1.18.0) (2022-07-09)

### Features
* feat: do not publish to npm private packages ([5a7ddea](https://github.com/semrel-extra/zx-bulk-release/commit/5a7ddead35b95adfc5f0450084ca78ead0edc531))
* feat: do not publish to npm private packages ([2e236d8](https://github.com/semrel-extra/zx-bulk-release/commit/2e236d83de4342a6ee6b9e937e6a4dd20d1b3a2e))

### Fixes & improvements
* fix: fetch is not defined ([8e6cca1](https://github.com/semrel-extra/zx-bulk-release/commit/8e6cca1d69aaeaec75de8404746163d9e2db9193))
* fix: correct extract private field ([5624baa](https://github.com/semrel-extra/zx-bulk-release/commit/5624baa10eee03e5f327e7d51529883b40a4a961))

## [1.17.7](https://github.com/semrel-extra/zx-bulk-release/compare/v1.17.6...v1.17.7) (2022-07-06)

### Fixes & improvements
* fix: fix `fetchPkg` target dir ([5ebf5f1](https://github.com/semrel-extra/zx-bulk-release/commit/5ebf5f10d42bad4c6903ef3a195da037d455e446))

## [1.17.6](https://github.com/semrel-extra/zx-bulk-release/compare/v1.17.5...v1.17.6) (2022-07-06)

### Fixes & improvements
* perf: update zx-extra to v2.4.0, rm own `ini` dep ([e746a72](https://github.com/semrel-extra/zx-bulk-release/commit/e746a72d28abc5f941a74dd191e54dac300a9aa7))

## [1.17.5](https://github.com/semrel-extra/zx-bulk-release/compare/v1.17.4...v1.17.5) (2022-07-05)

### Fixes & improvements
* perf: update zx-extra to v2.3.0 ([9de650f](https://github.com/semrel-extra/zx-bulk-release/commit/9de650fb84e1a33a1d670c394c94b565e7d11f3c))

## [1.17.4](https://github.com/semrel-extra/zx-bulk-release/compare/v1.17.3...v1.17.4) (2022-07-03)

### Fixes & improvements
* fix: fix tag pattern ([240b452](https://github.com/semrel-extra/zx-bulk-release/commit/240b452b8ee414bfbb0d13a0218790059400eb06))

## [1.17.3](https://github.com/semrel-extra/zx-bulk-release/compare/v1.17.2...v1.17.3) (2022-06-29)

### Fixes & improvements
* docs: add roadmap ([185a12d](https://github.com/semrel-extra/zx-bulk-release/commit/185a12d8956c3e274035b863682afee3bd64ccb7))

## [1.17.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.17.1...v1.17.2) (2022-06-28)

### Fixes & improvements
* docs: add npm badge ([f63dfe3](https://github.com/semrel-extra/zx-bulk-release/commit/f63dfe338208641a8edd910b81e320deeed2446c))

## [1.17.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.17.0...v1.17.1) (2022-06-28)

### Fixes & improvements
* docs: describe `analyze` step ([ae611ad](https://github.com/semrel-extra/zx-bulk-release/commit/ae611ada7709d9f9fa72d20f39e74ebe05353a2d))

## [1.17.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.16.2...v1.17.0) (2022-06-28)

### Fixes & improvements
* docs: describe CLI options ([e744e97](https://github.com/semrel-extra/zx-bulk-release/commit/e744e97e8e5451ffff217283ad4e552f05073e7c))
* docs: describe internal release flow ([e29bfc9](https://github.com/semrel-extra/zx-bulk-release/commit/e29bfc968a519d7c48b0475ad30c826bef17fb96))

### Features
* feat: introduce `--include-private` and `ignore` flags ([d029b62](https://github.com/semrel-extra/zx-bulk-release/commit/d029b6242da2e3c7fabaa5e24d61709b47e42b94))

## [1.16.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.16.1...v1.16.2) (2022-06-28)

### Fixes & improvements
* refactor: separate `analyze` helper ([1f76993](https://github.com/semrel-extra/zx-bulk-release/commit/1f76993d3d9539a02d516c0cd757713964f6f523))

## [1.16.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.16.0...v1.16.1) (2022-06-28)

### Fixes & improvements
* refactor: extract tag utils from publish.js ([82b3ef0](https://github.com/semrel-extra/zx-bulk-release/commit/82b3ef02affb65bb79eda5f54f32b0378e7083f2))

## [1.16.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.15.0...v1.16.0) (2022-06-28)

### Features
* feat: use npm pkg registry for meta fallback ([ee771cb](https://github.com/semrel-extra/zx-bulk-release/commit/ee771cb0320845e81782ae6143380e4c6d241b33))

### Fixes & improvements
* refactor: separate repo utils ([869e3d3](https://github.com/semrel-extra/zx-bulk-release/commit/869e3d3e1cd5998d17b2a638f6b12e768f866644))
* refactor: separate npm domain ([28c5887](https://github.com/semrel-extra/zx-bulk-release/commit/28c5887c7f4ea269122b428796fef10a0926346e))

## [1.15.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.14.6...v1.15.0) (2022-06-27)

### Features
* feat: print queue ([65b768c](https://github.com/semrel-extra/zx-bulk-release/commit/65b768ced601820ab6caab2f8259d481e277be4d))

## [1.14.6](https://github.com/semrel-extra/zx-bulk-release/compare/v1.14.5...v1.14.6) (2022-06-27)

### Fixes & improvements
* docs: add demo link ([1e35af4](https://github.com/semrel-extra/zx-bulk-release/commit/1e35af4d4e925c5d5a0c022e135dee2f94a2c1a0))

## [1.14.5](https://github.com/semrel-extra/zx-bulk-release/compare/v1.14.4...v1.14.5) (2022-06-27)

### Fixes & improvements
* docs: mention vercel/turborepo ([a0dc3e9](https://github.com/semrel-extra/zx-bulk-release/commit/a0dc3e9f637f349e5d855855612824bc1d538178))

## [1.14.4](https://github.com/semrel-extra/zx-bulk-release/compare/v1.14.3...v1.14.4) (2022-06-27)

### Fixes & improvements
* refactor: simplify pkg build condition ([d6f236b](https://github.com/semrel-extra/zx-bulk-release/commit/d6f236b99e98b324cc180cbbdc2a41d92385498b))

## [1.14.3](https://github.com/semrel-extra/zx-bulk-release/compare/v1.14.2...v1.14.3) (2022-06-27)

### Fixes & improvements
* fix: disable gh-pages by default ([78ce3e8](https://github.com/semrel-extra/zx-bulk-release/commit/78ce3e84cf217a4f91e62cf27281d2f1e014168d))

## [1.14.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.14.1...v1.14.2) (2022-06-27)

### Fixes & improvements
* refactor: memoize origins ([4df0550](https://github.com/semrel-extra/zx-bulk-release/commit/4df05504f8a3ba770614374aff792bbc540cb640))

## [1.14.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.14.0...v1.14.1) (2022-06-27)

### Fixes & improvements
* fix: impr gh-pages path resolve ([09a5ae9](https://github.com/semrel-extra/zx-bulk-release/commit/09a5ae96fc17b6d819a5622bef15045476a4b4ed))

## [1.14.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.13.0...v1.14.0) (2022-06-27)

### Features
* feat: add config normalizer ([80afee7](https://github.com/semrel-extra/zx-bulk-release/commit/80afee796e71aef6288943b2c6276b6f172192c5))

## [1.13.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.12.0...v1.13.0) (2022-06-27)

### Features
* feat: add log labels ([a0e80b6](https://github.com/semrel-extra/zx-bulk-release/commit/a0e80b64215c3f69206713cd6073c0240b0930c9))
* feat: add changelog generator ([4c0914f](https://github.com/semrel-extra/zx-bulk-release/commit/4c0914f24a91e2297f8c6ff8410949c2a0220fb5))

## [1.12.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.11.2...v1.12.0) (2022-06-26)

### Features
* feat: enhance default gh-pages commit msg ([81ecd7f](https://github.com/semrel-extra/zx-bulk-release/commit/81ecd7f73478c4e1f62d4287b81931e7a8120d58))

## [1.11.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.11.1...v1.11.2) (2022-06-26)

### Fixes & improvements
* fix: add global try-catch ([9255cb1](https://github.com/semrel-extra/zx-bulk-release/commit/9255cb1606ecb78a47e4fc1941cf26b3318f85ac))

## [1.11.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.11.0...v1.11.1) (2022-06-26)

### Fixes & improvements
* fix: sort tags by version ([0c0dfde](https://github.com/semrel-extra/zx-bulk-release/commit/0c0dfdea415a6507492beed0c6b643eaab9f92d7))

## [1.11.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.10.1...v1.11.0) (2022-06-26)

### Features
* feat: pass $.argv as default flags ([e07f619](https://github.com/semrel-extra/zx-bulk-release/commit/e07f619f85bccd2f8592ff3f1c3e6bc4af05b38d))

## [1.10.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.10.0...v1.10.1) (2022-06-26)

### Fixes & improvements
* refactor: simplify build helper ([bebd070](https://github.com/semrel-extra/zx-bulk-release/commit/bebd070355b26c131d389ac03b7d37444b9df94a))

## [1.10.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.9.2...v1.10.0) (2022-06-26)

### Fixes & improvements
* docs: add CC badges ([475c57a](https://github.com/semrel-extra/zx-bulk-release/commit/475c57aaa6efc1bf8bb6e44b3abbfb6da2f425dd))

### Features
* feat: configure ghPages push via opts ([ccc124e](https://github.com/semrel-extra/zx-bulk-release/commit/ccc124ef87fe4e049386d45c1676929dc0d36edd))

## [1.9.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.9.1...v1.9.2) (2022-06-26)

### Fixes & improvements
* refactor: simplify build flow ([900380d](https://github.com/semrel-extra/zx-bulk-release/commit/900380da36be115290da6117090da47bdd3fc8f7))

## [1.9.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.9.0...v1.9.1) (2022-06-26)

### Fixes & improvements
* refactor: replace postbuild hook with postupdate ([b7d68a5](https://github.com/semrel-extra/zx-bulk-release/commit/b7d68a5a2b9dec6516204f3fcbbc3c08db9c6d90))

## [1.9.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.8.0...v1.9.0) (2022-06-26)

### Features
* feat: add gh-pages push ([32130b6](https://github.com/semrel-extra/zx-bulk-release/commit/32130b64a2088cc98b1cae678691cd55c18fe0a3))

## [1.8.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.7.8...v1.8.0) (2022-06-26)

### Features
* feat: add cosmiconfig ([1fe694d](https://github.com/semrel-extra/zx-bulk-release/commit/1fe694d2c919a029eb4aa5d5f500b287a2035608))

### Fixes & improvements
* docs: formatting ([d2bac88](https://github.com/semrel-extra/zx-bulk-release/commit/d2bac8893d33f4c9ce6c003c4f7188ea56452023))

## [1.7.8](https://github.com/semrel-extra/zx-bulk-release/compare/v1.7.7...v1.7.8) (2022-06-26)

### Fixes & improvements
* docs: mention jscutlery/semver and intuit/auto ([36b3da0](https://github.com/semrel-extra/zx-bulk-release/commit/36b3da029958c94e8a2e1a03da162ad3ac89bcac))

## [1.7.7](https://github.com/semrel-extra/zx-bulk-release/compare/v1.7.6...v1.7.7) (2022-06-26)

### Fixes & improvements
* docs: describe envs ([de70c03](https://github.com/semrel-extra/zx-bulk-release/commit/de70c03e3e6166cb722a03f8a43ff75614de5941))
* refactor: enhance `parseRepo` helper ([7545427](https://github.com/semrel-extra/zx-bulk-release/commit/75454271e4fb472884ce80559c1713fca46faeb8))

## [1.7.6](https://github.com/semrel-extra/zx-bulk-release/compare/v1.7.5...v1.7.6) (2022-06-25)

### Fixes & improvements
* fix: fix fallback version on cross-update ([d757329](https://github.com/semrel-extra/zx-bulk-release/commit/d7573299793d03b334f47640e61c7efa2d03e911))

## [1.7.5](https://github.com/semrel-extra/zx-bulk-release/compare/v1.7.4...v1.7.5) (2022-06-25)

### Fixes & improvements
* fix: rm redundant build try-catch ([ffaa845](https://github.com/semrel-extra/zx-bulk-release/commit/ffaa845926ca23a5e4f459e3c590758da59ce04b))

## [1.7.4](https://github.com/semrel-extra/zx-bulk-release/compare/v1.7.3...v1.7.4) (2022-06-25)

### Fixes & improvements
* fix: fix yarn install ([4f12b80](https://github.com/semrel-extra/zx-bulk-release/commit/4f12b80a016ea11bedaba5292517d1c329acae80))

## [1.7.3](https://github.com/semrel-extra/zx-bulk-release/compare/v1.7.2...v1.7.3) (2022-06-25)

### Fixes & improvements
* fix: mv yarn install to build.js ([3d49325](https://github.com/semrel-extra/zx-bulk-release/commit/3d49325b5348a80ee6c7e4c5647f459e81130af7))

## [1.7.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.7.1...v1.7.2) (2022-06-25)

### Fixes & improvements
* fix: fix npm token path for npm fetching ([33e9b59](https://github.com/semrel-extra/zx-bulk-release/commit/33e9b599f77e0fc77d8964df9da6df2a75e9d227))

## [1.7.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.7.0...v1.7.1) (2022-06-25)

### Fixes & improvements
* fix: fix yarn install cwd ([c6f0ae3](https://github.com/semrel-extra/zx-bulk-release/commit/c6f0ae3e0e9e8feca251a567e273380e278fe2a9))
* fix: update yarn assets after build/fetch ([b2958c4](https://github.com/semrel-extra/zx-bulk-release/commit/b2958c4d3de768bf993faad4816bbb7116d7bd78))

## [1.7.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.6.0...v1.7.0) (2022-06-25)

### Features
* feat: add optional `test` step ([6caa0ab](https://github.com/semrel-extra/zx-bulk-release/commit/6caa0ab4ddd8b464893e430a0a99fa7472f859ed))

## [1.6.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.5.0...v1.6.0) (2022-06-25)

### Features
* feat: add lazy builder ([4c59a0e](https://github.com/semrel-extra/zx-bulk-release/commit/4c59a0e61aea19cccd66228f34100d733bc3d3d8))
* feat: provide pkg building ([04ac6ce](https://github.com/semrel-extra/zx-bulk-release/commit/04ac6cee878aa8cfa329b16348735ba809544bea))

### Fixes & improvements
* refactor: reuse `traverseDeps` ([626de1c](https://github.com/semrel-extra/zx-bulk-release/commit/626de1c9250bce831aa9ec6298077bd5b91e06b0))

## [1.5.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.4.2...v1.5.0) (2022-06-21)

### Features
* feat: add commit-ish to meta ([9092a4d](https://github.com/semrel-extra/zx-bulk-release/commit/9092a4d41f51fb58a9d7cb1696bb9ee3f07c9133))

## [1.4.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.4.1...v1.4.2) (2022-06-21)

### Fixes & improvements
* refactor: use common iface for push internals ([e614e42](https://github.com/semrel-extra/zx-bulk-release/commit/e614e42d8b323749082b94611f4552fdacebe1f5))

## [1.4.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.4.0...v1.4.1) (2022-06-21)

### Fixes & improvements
* fix: fix commits refs in release data ([1ddd2e9](https://github.com/semrel-extra/zx-bulk-release/commit/1ddd2e99e88e245bf5d6b477adb6fca0d2c4c663))

## [1.4.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.3.0...v1.4.0) (2022-06-21)

### Features
* feat: add gh release ([df43fca](https://github.com/semrel-extra/zx-bulk-release/commit/df43fca694668a838f287d38b4f298aa9da2acdd))

### Fixes & improvements
* refactor: add parseEnv util ([936b5ed](https://github.com/semrel-extra/zx-bulk-release/commit/936b5edaf3472f66dba2f9c60bb9745096fda729))

## [1.3.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.2.0...v1.3.0) (2022-06-21)

### Features
* feat: add gh username and token env aliases ([892bfdc](https://github.com/semrel-extra/zx-bulk-release/commit/892bfdc86215a0532939f24ca4a2690d69e8d59e))

## [1.2.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.1.2...v1.2.0) (2022-06-21)

### Features
* feat: parse legacy lerna tags ([c130191](https://github.com/semrel-extra/zx-bulk-release/commit/c130191f192b185937286730b8c3505d5674c7c1))
* feat: introduce meta.json to store release details ([a20c348](https://github.com/semrel-extra/zx-bulk-release/commit/a20c34809e29d772a44f71990fdb11921a49ca9f))

## [1.1.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.1.1...v1.1.2) (2022-06-18)

### Fixes & improvements
* docs: fix usage example ([d18c169](https://github.com/semrel-extra/zx-bulk-release/commit/d18c1691c8447ffa1cde3dc5aa52fadf307d359a))

## [1.1.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.1.0...v1.1.1) (2022-06-18)

### Fixes & improvements
* docs: mention js api ([06cda98](https://github.com/semrel-extra/zx-bulk-release/commit/06cda9869b96fc2aca5d278f45d5e733e2cc23ab))

## [1.1.0](https://github.com/semrel-extra/zx-bulk-release/compare/v1.0.3...v1.1.0) (2022-06-18)

### Features
* feat: add dry-run flag ([1c61ea4](https://github.com/semrel-extra/zx-bulk-release/commit/1c61ea4da0a0f6bac8f6135a285335a150c51e9b))

## [1.0.3](https://github.com/semrel-extra/zx-bulk-release/compare/v1.0.2...v1.0.3) (2022-06-17)

### Fixes & improvements
* refactor: separate git url builder ([1f07a97](https://github.com/semrel-extra/zx-bulk-release/commit/1f07a978e7f731047403ba3f40a72c5cd8275b07))

## [1.0.2](https://github.com/semrel-extra/zx-bulk-release/compare/v1.0.1...v1.0.2) (2022-06-17)

### Fixes & improvements
* fix: add missing shebang ([90ebf45](https://github.com/semrel-extra/zx-bulk-release/commit/90ebf459b4e4bdea099ca75c6572101845fea7c6))

## [1.0.1](https://github.com/semrel-extra/zx-bulk-release/compare/v1.0.0...v1.0.1) (2022-06-17)

### Fixes & improvements
* fix: add bin path ([29ae3c4](https://github.com/semrel-extra/zx-bulk-release/commit/29ae3c4896c9e46edffc776356fc4388412a19ee))

## [1.0.0](https://github.com/semrel-extra/zx-bulk-release/compare/undefined...v1.0.0) (2022-06-17)

### Features
* feat: handle `workspace:` prefix ([d916069](https://github.com/semrel-extra/zx-bulk-release/commit/d9160696d5beefaf4c11ad27ffdb3675e9125273))
* feat: add artifact push ([4852e90](https://github.com/semrel-extra/zx-bulk-release/commit/4852e903f7515a13516eae7a8c44e2458113b382))
* feat: add tag on publish ([dc9af36](https://github.com/semrel-extra/zx-bulk-release/commit/dc9af3634bed102912ef98e3e98fabbc6f1966b7))
* feat: add metabranch api ([b4c9562](https://github.com/semrel-extra/zx-bulk-release/commit/b4c95622cf5aa3aecf5853a1a266933c2dcddf14))
* feat: add deps updater ([21e7fa6](https://github.com/semrel-extra/zx-bulk-release/commit/21e7fa60f49910aa65940007e2ba2c05f0b305e9))
* feat: add tag parser/formatter ([1cee4e6](https://github.com/semrel-extra/zx-bulk-release/commit/1cee4e6f3680711a5eb079f0695c794297f0900f))
* feat: add pkg commits extractor ([5c4dde2](https://github.com/semrel-extra/zx-bulk-release/commit/5c4dde206123f55f75c15b65d992e61e2ee73204))

### Fixes & improvements
* refactor: separate publish utils ([48d756b](https://github.com/semrel-extra/zx-bulk-release/commit/48d756badf57012b7ae97ae8f4bd4ccbc0dd473d))
* docs: add refs ([c937fce](https://github.com/semrel-extra/zx-bulk-release/commit/c937fce4472f68c5d8e92e8970a15fca017dc656))
* docs: add basic description ([bb4d0f4](https://github.com/semrel-extra/zx-bulk-release/commit/bb4d0f4e33cfae78868400e8bf17f488d5d4a2de))
