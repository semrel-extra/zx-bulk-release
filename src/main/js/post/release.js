import os from 'node:os'
import {createRequire} from 'node:module'
import {$, within, fs, glob, path} from 'zx-extra'
import {queuefy} from 'queuefy'
import {topo, traverseQueue} from './depot/deps.js'
import {createReport, log} from './log.js'
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

export const run = async ({cwd = process.cwd(), env, flags = {}} = {}) => within(async () => {
  $.memo = new Map()

  const {version: zbrVersion} = createRequire(import.meta.url)('../../../../package.json')
  if (flags.v || flags.version) {
    console.log(zbrVersion)
    return
  }

  // --deliver [dir]: standalone delivery from pre-packed tars.
  if (flags.deliver) {
    const dir = typeof flags.deliver === 'string' ? flags.deliver : PARCELS_DIR
    const tars = await glob(path.join(dir, 'parcel.*.tar'))
    if (!tars.length) {
      log.info(`deliver: no parcels in ${dir}, nothing to do`)
      return
    }
    const _env = {...process.env, ...env}
    log.secret(_env.GH_TOKEN, _env.GITHUB_TOKEN, _env.NPM_TOKEN)
    log.info(`deliver: ${tars.length} tar(s) from ${dir}`)
    const delivered = await deliver(tars, _env)
    log.info(`deliver: done, ${delivered} delivered`)
    return
  }

  const ctx = await createContext({flags, env, cwd})
  const {report, packages, queue, prev} = ctx

  const forEachPkg = (cb) => traverseQueue({queue, prev, cb: (name) => within(async () => {
    $.scope = name
    const pkg = packages[name]
    await contextify(pkg, ctx)
    return cb(pkg)
  })})

  report
    .log(`zx-bulk-release@${zbrVersion}`)
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
      if (!pkg.releaseType) {
        report.setStatus('skipped', pkg.name)
        pkg.skipped = true
        return
      }
      if (flags.build !== false) {
        report.setStatus('building', pkg.name)
        await build(pkg)
      }
      if (flags.test !== false) {
        report.setStatus('testing', pkg.name)
        await test(pkg)
      }
      if (flags.dryRun || flags.publish === false) {
        report.setStatus('success', pkg.name)
        return
      }

      report.setStatus('packing', pkg.name)
      await pack(pkg)

      // --pack <dir>: pack only, skip delivery.
      if (flags.pack) {
        report.setStatus('packed', pkg.name)
        return
      }

      report.setStatus('publishing', pkg.name)
      await publish(pkg)
      report.setStatus('success', pkg.name)
    })
  } catch (e) {
    report.error(e, e.stack).set('error', e).setStatus('failure')
    throw e
  } finally {
    await clean(ctx)
  }
  report.setStatus('success').log('Great success!')
})

export const createContext = async ({flags, env: _env, cwd}) => {
  const {packages, queue, root, prev, graphs} = await topo({cwd, flags})
  const report = createReport({packages, queue, flags})
  const env = {...process.env, ..._env}

  log.secret(env.GH_TOKEN, env.GITHUB_TOKEN, env.NPM_TOKEN)

  $.report  = report
  $.env     = env
  $.verbose = !!(flags.debug || env.DEBUG) || $.verbose
  $.quiet   = !$.verbose

  return {
    cwd, env, flags, root, packages, queue, prev, graphs, report,
    channels,
    run: queuefy(exec, flags.concurrency || os.cpus().length),
  }
}
