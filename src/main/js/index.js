import {within, $} from 'zx-extra'
import {analyze} from './analyze.js'
import {publish} from './publish.js'
import {build} from './build.js'
import {contextify} from './contextify.js'
import {topo} from './topo.js'
import {createReporter, log} from './util.js';

export const run = async ({cwd = process.cwd(), env, flags = {}} = {}) => within(async () => {
  $.r = createReporter()
  $.env = {...process.env, ...env}
  $.verbose = !!(flags.debug || $.env.DEBUG ) || $.verbose

  log()('zx-bulk-release')

  try {
  const {packages, queue, root} = await topo({cwd, flags})
  $.r.setQueue(queue)
  $.r.setPackages(packages)

  for (let name of queue) {
    const pkg = packages[name]

    await contextify(pkg, packages, root)
    await analyze(pkg, packages)

    if (pkg.changes.length === 0) continue

    await build(pkg, packages)

    if (flags.dryRun) continue

    await publish(pkg)
  }
  } catch (e) {
    log({level: 'error'})(e)
    throw e
  }
  log()('Great success!')
})
