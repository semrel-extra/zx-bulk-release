import {memoizeBy} from '../../../util.js'
import {api} from '../../api/index.js'
import {traverseDeps} from '../deps.js'
import {exec} from '../exec.js'

export const build = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  const {run = exec, flags = {}, packages} = ctx
  await Promise.all([
    traverseDeps({pkg, packages, cb: ({pkg}) => build(pkg, ctx)}),
    pkg.manifest.private !== true && pkg.changes.length === 0 && pkg.config.npmFetch && flags.npmFetch !== false
      ? api.npm.fetchPkg(pkg)
      : Promise.resolve()
  ])

  if (!pkg.fetched) {
    await run(pkg, 'buildCmd')
  }

  pkg.built = true
})
