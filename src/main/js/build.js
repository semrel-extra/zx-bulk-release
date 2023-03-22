import {traverseDeps} from './deps.js'
import {fetchPkg} from './npm.js'
import {runCmd} from './processor.js'

export const build = async (pkg, packages, run = runCmd, self = build) => {
  if (pkg.built) return true

  await traverseDeps(pkg, packages, async (_, {pkg}) => self(pkg, packages))

  const {config} = pkg

  if (pkg.changes.length === 0 && config.npmFetch) {
    await fetchPkg(pkg)
  }

  if (!pkg.fetched && config.buildCmd) {
    await run(pkg, 'buildCmd')
  }

  pkg.built = true
  return true
}
