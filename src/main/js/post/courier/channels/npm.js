import {path} from 'zx-extra'
import {npmPublish} from '../../api/npm.js'

export const isNpmPublished = (pkg) =>
  !pkg.manifest.private && pkg.config.npmPublish !== false

export default {
  name:     'npm',
  requires: (manifest) => manifest.oidc ? [] : ['token'],
  when:     isNpmPublished,
  run:      (manifest, dir) => npmPublish({
    name: manifest.name,
    version: manifest.version,
    npmTarball: path.join(dir, 'package.tgz'),
    preversion: manifest.preversion,
    manifest: {},
    config: {
      npmRegistry: manifest.registry,
      npmToken: manifest.token,
      npmConfig: manifest.config,
      npmProvenance: manifest.provenance,
      npmOidc: manifest.oidc,
    },
  }),
  snapshot: true,
}
