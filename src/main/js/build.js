import {traverseDeps} from './deps.js'
import {fetchPkg} from './npm.js'
import {runCmd} from './processor.js'

export const build = async (pkg, packages, run = runCmd, self = build) => {
  if (pkg.built) return true

  await traverseDeps(pkg, packages, async (_, {pkg}) => self(pkg, packages, run, self))

  if (pkg.changes.length === 0 && pkg.config.npmFetch) {
    await fetchPkg(pkg)
  }

  if (!pkg.fetched) {
    await run(pkg, 'buildCmd')
    await run(pkg, 'testCmd')
  }

  pkg.built = true
  return true
}
