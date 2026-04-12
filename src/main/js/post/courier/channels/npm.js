import {path} from 'zx-extra'
import {npmPublish} from '../../api/npm.js'

export const isNpmPublished = (pkg) =>
  !pkg.manifest.private && pkg.config.npmPublish !== false

const isDuplicate = (e) =>
  /EPUBLISHCONFLICT|cannot publish over|403/i.test(e?.message || e?.stderr || '')

const run = async (manifest, dir) => {
  try {
    await npmPublish({
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
    })
    return 'ok'
  } catch (e) {
    if (isDuplicate(e)) return 'duplicate'
    throw e
  }
}

export default {
  name:     'npm',
  requires: (manifest) => manifest.oidc ? [] : ['token'],
  when:     isNpmPublished,
  run,
  snapshot: true,
}
