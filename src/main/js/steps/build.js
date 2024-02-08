import {memoizeBy} from '../util.js'
import {$, within} from 'zx-extra'
import {fetchPkg} from '../api/npm.js'
import {traverseDeps} from '../processor/deps.js'
import {exec} from '../processor/exec.js'

export const build = memoizeBy(async (pkg, run = exec, flags = {}, self = build) => within(async () => {
  $.scope = pkg.name

  await Promise.all([
    traverseDeps({pkg, packages: pkg.context.packages, cb: async({pkg}) => self(pkg, run, flags, self)}),
    pkg.manifest.private !== true && pkg.changes.length === 0 && pkg.config.npmFetch && flags.npmFetch !== false
      ? fetchPkg(pkg)
      : Promise.resolve()
  ])

  if (!pkg.fetched) {
    await run(pkg, 'buildCmd')
    // await run(pkg, 'testCmd')
  }

  pkg.built = true
}))
