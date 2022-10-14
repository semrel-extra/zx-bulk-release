import {within, $} from 'zx-extra'
import {analyze} from './analyze.js'
import {publish} from './publish.js'
import {build} from './build.js'
import {contextify} from './contextify.js'
import {topo} from './topo.js'
import {createReporter, log} from './util.js';

export const run = async ({cwd = process.cwd(), env, flags = {}} = {}) => within(async () => {
  const reporter = $.r = createReporter(flags.report)
  $.env = {...process.env, ...env}
  $.verbose = !!(flags.debug || $.env.DEBUG ) || $.verbose

  log()('zx-bulk-release')

  try {
  const {packages, queue, root} = await topo({cwd, flags})
  reporter.setState('queue', queue)
  reporter.setPackages(packages)

  log()('queue:', queue)

  reporter.setStatus('pending')
  for (let name of queue) {
    const pkg = packages[name]

    reporter.setStatus('analyzing', name)
    await contextify(pkg, packages, root)
    await analyze(pkg, packages)
    reporter.setState('version', pkg.version, name)
    reporter.setState('prevVersion', pkg.latest.tag?.version || pkg.manifest.version, name)
    reporter.setState('releaseType', pkg.releaseType, name)

    // pkg.latest.tag?.version || pkg.manifest.version

    if (pkg.changes.length === 0) {
      reporter.setStatus('skipped', name)
      continue
    }

    reporter.setStatus('building', name)
    await build(pkg, packages)
    reporter.setStatus('')

    if (flags.dryRun) {
      reporter.setStatus('success', name)
      continue
    }

    reporter.setStatus('publishing', name)
    await publish(pkg)

    reporter.setStatus('success', name)
  }
  } catch (e) {
    log({level: 'error'})(e)
    reporter.setState('error', e)
    reporter.setStatus('failure')
    throw e
  }
  reporter.setStatus('success')
  log()('Great success!')
})
