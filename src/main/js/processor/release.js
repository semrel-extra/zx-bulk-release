import os from 'node:os'
import {createRequire} from 'node:module'
import {$, within} from 'zx-extra'
import {queuefy} from 'queuefy'
import {topo, traverseQueue} from './deps.js'
import {createReport, log} from './log.js'
import {exec} from './exec.js'

import {contextify} from './steps/contextify.js'
import {recover} from './steps/teardown.js'
import {fetchTags} from './api/git.js'
import {analyze} from './steps/analyze.js'
import {build} from './steps/build.js'
import {publish} from './steps/publish.js'
import {clean} from './steps/clean.js'
import {test} from './steps/test.js'

import {defaultOrder as publishers} from '../courier/index.js'

export const run = async ({cwd = process.cwd(), env, flags = {}} = {}) => within(async () => {
  $.memo = new Map()

  const {version: zbrVersion} = createRequire(import.meta.url)('../../../../package.json')
  if (flags.v || flags.version) {
    console.log(zbrVersion)
    return
  }

  const ctx = await createContext({flags, env, cwd})
  const {report, packages, queue, prev} = ctx

  // Per-package scope: $.scope, packages[name] lookup, contextify on first touch.
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

  // --recover: standalone mode — clean orphan tags and exit.
  if (flags.recover) {
    await fetchTags(cwd)
    let recovered = 0
    await forEachPkg(async (pkg) => { if (await recover(pkg)) recovered++ })
    report.log(`recover: cleaned ${recovered} orphan tag(s)`)
    return
  }

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
      if (!flags.dryRun && flags.publish !== false) {
        report.setStatus('publishing', pkg.name)
        await publish(pkg)
      }
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

  // Register known secrets so the logger redacts them from all output.
  log.secret(env.GH_TOKEN, env.GITHUB_TOKEN, env.NPM_TOKEN)

  $.report  = report
  $.env     = env
  $.verbose = !!(flags.debug || env.DEBUG) || $.verbose
  $.quiet   = !$.verbose

  return {
    cwd, env, flags, root, packages, queue, prev, graphs, report,
    publishers,
    run: queuefy(exec, flags.concurrency || os.cpus().length),
  }
}
