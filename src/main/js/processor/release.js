import os from 'node:os'
import {createRequire} from 'node:module'
import {$, within} from 'zx-extra'
import {queuefy} from 'queuefy'
import {topo, traverseQueue} from './deps.js'
import {createReport} from '../log.js'
import {exec} from './exec.js'
import {contextify} from '../steps/contextify.js'
import {analyze} from '../steps/analyze.js'
import {build} from '../steps/build.js'
import {publish} from '../steps/publish.js'
import {clean} from '../steps/clean.js'
import {test} from '../steps/test.js'

export const run = async ({cwd = process.cwd(), env, flags = {}} = {}) => within(async () => {
  const {version: zbrVersion} = createRequire(import.meta.url)('../../../../package.json')
  if (flags.v || flags.version) {
    console.log(zbrVersion)
    return
  }

  const context = await createContext({flags, env, cwd})
  const {report, packages, queue, prev, graphs} = context
  const _exec = queuefy(exec, flags.concurrency || os.cpus().length)

  report
    .log()(`zx-bulk-release@${zbrVersion}`)
    .log()('queue:', queue)
    .log()('graphs', graphs)

  try {
    await traverseQueue({queue, prev, async cb(name) {
      report.setStatus('analyzing', name)
      const pkg = packages[name]
      await contextify(pkg, context)
      await analyze(pkg)
      report
        .set('config', pkg.config, name)
        .set('version', pkg.version, name)
        .set('prevVersion', pkg.latest.tag?.version || pkg.manifest.version, name)
        .set('releaseType', pkg.releaseType, name)
        .set('tag', pkg.tag, name)
    }})

    report.setStatus('pending')

    await traverseQueue({queue, prev, async cb(name) {
      const pkg = packages[name]

      if (!pkg.releaseType) {
        report.setStatus('skipped', name)
        pkg.skipped = true
        return
      }
      if (flags.build !== false) {
        report.setStatus('building', name)
        await build(pkg, _exec)
      }
      if (flags.test !== false) {
        report.setStatus('testing', name)
        await test(pkg, _exec)
      }
      if (!flags.dryRun && flags.publish !== false) {
        report.setStatus('publishing', name)
        await publish(pkg, _exec)
      }

      report.setStatus('success', name)
    }})
  } catch (e) {
    report
      .log({level: 'error'})(e, e.stack)
      .set('error', e)
      .setStatus('failure')
    throw e
  } finally {
    await clean(cwd, packages)
  }
  report
    .setStatus('success')
    .log()('Great success!')
})

export const createContext = async ({flags, env: _env, cwd}) => {
  const { packages, queue, root, prev, graphs } = await topo({cwd, flags})
  const report = createReport({packages, queue, flags})
  const env = {...process.env, ..._env}

  $.report =        report
  $.env =           env
  $.verbose =       !!(flags.debug || $.env.DEBUG ) || $.verbose

  return {
    report,
    packages,
    root,
    queue,
    prev,
    graphs,
    flags,
    env
  }
}
