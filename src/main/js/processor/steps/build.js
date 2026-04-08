import {memoizeBy} from '../../util.js'
import {fetchPkg} from '../api/npm.js'
import {traverseDeps} from '../deps.js'
import {exec} from '../exec.js'

export const build = memoizeBy(async (pkg, ctx) => {
  const {run = exec, flags = {}} = ctx
  await Promise.all([
    traverseDeps({pkg, packages: pkg.context.packages, cb: ({pkg}) => build(pkg, ctx)}),
    pkg.manifest.private !== true && pkg.changes.length === 0 && pkg.config.npmFetch && flags.npmFetch !== false
      ? fetchPkg(pkg)
      : Promise.resolve()
  ])

  if (!pkg.fetched) {
    await run(pkg, 'buildCmd')
  }

  pkg.built = true
})
