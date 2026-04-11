import os from 'node:os'
import {createRequire} from 'node:module'
import {$, within, glob, path} from 'zx-extra'
import {queuefy} from 'queuefy'

import {createReport, log} from './log.js'
import {topo, traverseQueue} from './depot/deps.js'
import {exec} from './depot/exec.js'
import {contextify} from './depot/steps/contextify.js'
import {analyze} from './depot/steps/analyze.js'
import {build} from './depot/steps/build.js'
import {pack} from './depot/steps/pack.js'
import {publish} from './depot/steps/publish.js'
import {clean} from './depot/steps/clean.js'
import {test} from './depot/steps/test.js'
import {deliver, defaultOrder as channels} from './courier/index.js'

const PARCELS_DIR = 'parcels'
const ZBR_VERSION = createRequire(import.meta.url)('../../../../package.json').version

export const run = async ({cwd = process.cwd(), env: _env, flags = {}} = {}) => within(async () => {
  if (flags.v || flags.version)
    return console.log(ZBR_VERSION)

  const env = {...process.env, ..._env}
  log.secret(env.GH_TOKEN, env.GITHUB_TOKEN, env.NPM_TOKEN)
  log.info(`zx-bulk-release@${ZBR_VERSION}`)

  return flags.deliver
    ? runDeliver({env, flags})
    : runPipeline({cwd, env, flags})
})

// --deliver [dir]
const runDeliver = async ({env, flags}) => {
  const dir = typeof flags.deliver === 'string' ? flags.deliver : PARCELS_DIR
  const report = createReport({flags})

  $.memo = new Map()
  $.report = report

  report.setStatus('inspecting')

  const tars = await glob(path.join(dir, 'parcel.*.tar'))
  if (!tars.length) return report.setStatus('success').log(`no parcels in ${dir}`)

  report.setStatus('delivering').log(`parcels: ${tars.length}`)
  const result = await deliver(tars, env, {dryRun: flags.dryRun})
  report.set('delivery', result).setStatus('success')

  log.info(`done: ${result.delivered} delivered, ${result.skipped} skipped`)
}

// full pipeline (legacy / --pack)
const runPipeline = async ({cwd, env, flags}) => {
  const ctx = await createContext({flags, env, cwd})
  const {report, packages, queue, prev} = ctx

  const forEachPkg = (cb) => traverseQueue({queue, prev, cb: (name) => within(async () => {
    $.scope = name
    await contextify(packages[name], ctx)
    return cb(packages[name])
  })})

  report
    .log('queue:', queue)
    .log('graphs', ctx.graphs)

  try {
    await forEachPkg(async (pkg) => {
      report.setStatus('analyzing', pkg.name)
      await analyze(pkg)
      report.set({
        config:      pkg.config,
        version:     pkg.version,
        prevVersion: pkg.latest.tag?.version || pkg.manifest.version,
        releaseType: pkg.releaseType,
        tag:         pkg.tag,
      }, pkg.name)
    })

    report.setStatus('pending')

    await forEachPkg(async (pkg) => {
      if (!pkg.releaseType) { pkg.skipped = true; return report.setStatus('skipped', pkg.name) }
      if (flags.build !== false) { report.setStatus('building',  pkg.name); await build(pkg) }
      if (flags.test  !== false) { report.setStatus('testing',   pkg.name); await test(pkg)  }
      if (flags.dryRun || flags.publish === false) return report.setStatus('success', pkg.name)

      report.setStatus('packing',    pkg.name); await pack(pkg)
      if (flags.pack) return report.setStatus('packed', pkg.name)

      report.setStatus('publishing', pkg.name); await publish(pkg)
      report.setStatus('success',    pkg.name)
    })
  } catch (e) {
    report.error(e, e.stack).set('error', e).setStatus('failure')
    throw e
  } finally {
    await clean(ctx)
  }
  report.setStatus('success').log('Great success!')
}

export const createContext = async ({flags, env, cwd}) => {
  const {packages, queue, root, prev, graphs} = await topo({cwd, flags})
  const report = createReport({packages, queue, flags})

  $.report  = report
  $.env     = env
  $.verbose = !!(flags.debug || env.DEBUG) || $.verbose
  $.quiet   = !$.verbose
  $.memo    = new Map()

  return {cwd, env, flags, root, packages, queue, prev, graphs, report, channels,
    run: queuefy(exec, flags.concurrency || os.cpus().length)}
}
