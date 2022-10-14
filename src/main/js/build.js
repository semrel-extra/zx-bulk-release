import {traverseDeps} from './deps.js'
import {fetchPkg} from './npm.js'
import {runHook} from './util.js'

export const build = async (pkg, packages) => {
  if (pkg.built) return true

  await traverseDeps(pkg, packages, async (_, {pkg}) => build(pkg, packages))

  const {config} = pkg

  if (pkg.changes.length === 0 && config.npmFetch) await fetchPkg(pkg)

  if (!pkg.fetched && config.buildCmd) {
    await runHook(pkg, 'buildCmd')
  }

  pkg.built = true
  return true
}
