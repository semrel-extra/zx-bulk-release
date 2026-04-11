import {npmPublish} from '../../processor/api/npm.js'

export const isNpmPublished = (pkg) =>
  !pkg.manifest.private && pkg.config.npmPublish !== false

export default {
  name:     'npm',
  when:     isNpmPublished,
  run:      (data) => npmPublish({
    name: data.name,
    version: data.version,
    npmTarball: data.tarball,
    preversion: data.preversion,
    manifest: {},
    config: {
      npmRegistry: data.registry,
      npmToken: data.token,
      npmConfig: data.config,
      npmProvenance: data.provenance,
      npmOidc: data.oidc,
    },
  }),
  snapshot: true,
}
