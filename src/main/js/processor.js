import os from 'node:os'
import {$, fs, within} from 'zx-extra'
import {log} from './log.js'
import {topo, traverse} from './topo.js'
import {contextify} from './contextify.js'
import {analyze} from './analyze.js'
import {build} from './build.js'
import {publish} from './publish.js'
import {createState} from './state.js'
import {tpl} from './util.js'
import {queuefy} from 'queuefy'

export const run = async ({cwd = process.cwd(), env, flags = {}, concurrency = os.cpus().length} = {}) => within(async () => {
  const state = createState({file: flags.report})
  const _runCmd = queuefy(runCmd, concurrency)

  $.state = state
  $.env = {...process.env, ...env}
  $.verbose = !!(flags.debug || $.env.DEBUG ) || $.verbose

  log()('zx-bulk-release')

  try {
    const {packages, queue, root, sources, next, prev, nodes} = await topo({cwd, flags})
    log()('queue:', queue)

    state.setQueue(queue, packages)

    await traverse({nodes, prev, async cb(name) {
      state.setStatus('analyzing', name)
      const pkg = packages[name]
      await contextify(pkg, packages, root)
      await analyze(pkg, packages)
      state.set('config', pkg.config, name)
      state.set('version', pkg.version, name)
      state.set('prevVersion', pkg.latest.tag?.version || pkg.manifest.version, name)
      state.set('releaseType', pkg.releaseType, name)
      state.set('tag', pkg.tag, name)
    }})

    state.setStatus('pending')

    await traverse({nodes, prev, async cb(name) {
      const pkg = packages[name]

      if (!pkg.releaseType) {
        state.setStatus('skipped', name)
        return
      }

      state.setStatus('building', name)
      await build(pkg, packages, _runCmd)

      if (flags.dryRun) {
        state.setStatus('success', name)
        return
      }

      state.setStatus('publishing', name)
      await publish(pkg, _runCmd)

      state.setStatus('success', name)
    }})
  } catch (e) {
    log({level: 'error'})(e)
    state.set('error', e)
    state.setStatus('failure')
    throw e
  }
  state.setStatus('success')
  log()('Great success!')
})

export const runCmd = async (pkg, name) => {
  const cmd = tpl(pkg.config[name], {...pkg, ...pkg.context})

  if (cmd) {
    log({pkg})(`run ${name} '${cmd}'`)
    await $.o({cwd: pkg.absPath, quote: v => v, preferLocal: true})`${cmd}`
  }
}
