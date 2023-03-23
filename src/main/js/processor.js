import os from 'node:os'
import {$, within} from 'zx-extra'
import {log} from './log.js'
import {topo, traverseQueue} from './deps.js'
import {analyze} from './analyze.js'
import {build} from './build.js'
import {getLatest, publish} from './publish.js'
import {createState} from './state.js'
import {memoizeBy, tpl} from './util.js'
import {queuefy} from 'queuefy'
import {getConfig} from "./config.js";

export const run = async ({cwd = process.cwd(), env, flags = {}} = {}) => within(async () => {
  const {state, build, publish} = createContext(flags, env)

  log()('zx-bulk-release')

  try {
    const {packages, queue, root, sources, next, prev, nodes, graphs, edges} = await topo({cwd, flags})
    log()('queue:', queue)
    log()('graphs', graphs)

    state.setQueue(queue, packages)

    await traverseQueue({queue, prev, async cb(name) {
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

    await traverseQueue({queue, prev, async cb(name) {
      const pkg = packages[name]

      if (!pkg.releaseType) {
        state.setStatus('skipped', name)
        return
      }

      state.setStatus('building', name)
      await build(pkg, packages)

      if (flags.dryRun) {
        state.setStatus('success', name)
        return
      }

      state.setStatus('publishing', name)
      await publish(pkg)

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

const createContext = (flags, env) => {
  const state = createState({file: flags.report})
  const _runCmd = queuefy(runCmd, flags.concurrency || os.cpus().length)
  const _build = memoizeBy((pkg, packages) => build(pkg, packages, _runCmd, _build))
  const _publish = memoizeBy((pkg) => publish(pkg, _runCmd))

  $.state = state
  $.env = {...process.env, ...env}
  $.verbose = !!(flags.debug || $.env.DEBUG ) || $.verbose

  return {
    state,
    runCmd: _runCmd,
    build: _build,
    publish: _publish
  }
}

// Inspired by https://docs.github.com/en/actions/learn-github-actions/contexts
export const contextify = async (pkg, packages, root) => {
  pkg.config = await getConfig(pkg.absPath, root.absPath)
  pkg.latest = await getLatest(pkg)
  pkg.context = {
    git: {
      sha: (await $`git rev-parse HEAD`).toString().trim(),
      root: (await $`git rev-parse --show-toplevel`).toString().trim(),
    },
    env: $.env,
    packages
  }
}
