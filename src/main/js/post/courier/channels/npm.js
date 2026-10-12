import {path} from 'zx-extra'
import {api} from '../../api/index.js'

export const isNpmPublished = (pkg) =>
  !pkg.manifest.private && pkg.config.npmPublish !== false

// npm, GitHub Packages and verdaccio say so when the version is already there; for other registries the
// registry itself decides. The claim already proves the version is ours: if it is there, an earlier run published it.
const isRepublish = (e) => /EPUBLISHCONFLICT|cannot publish over/i.test(e?.message || '')

const run = async (manifest, dir) => {
  const pkg = {
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
  }
  try {
    await api.npm.npmPublish(pkg)
    return 'ok'
  } catch (e) {
    if (isRepublish(e) || await api.npm.npmPublished(pkg)) return 'duplicate'
    throw e
  }
}

export default {
  name:     'npm',
  stage:    'publish',
  requires: (manifest) => manifest.oidc ? [] : ['token'],
  when:     isNpmPublished,
  run,
  snapshot: true,
}
