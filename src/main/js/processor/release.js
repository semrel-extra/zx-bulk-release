import os from 'node:os'
import {createRequire} from 'node:module'
import {$, within} from 'zx-extra'
import {queuefy} from 'queuefy'
import {topo, traverseQueue} from './deps.js'
import {createReport} from '../log.js'
import {exec} from './exec.js'
import {contextify} from './steps/contextify.js'
import {recover} from './steps/teardown.js'
import {fetchTags} from './api/git.js'
import {analyze} from './steps/analyze.js'
import {build} from './steps/build.js'
import {publish} from './steps/publish.js'
import {clean} from './steps/clean.js'
import {test} from './steps/test.js'
import meta from './publishers/meta.js'
import npm from './publishers/npm.js'
import ghRelease from './publishers/gh-release.js'
import ghPages from './publishers/gh-pages.js'
import changelog from './publishers/changelog.js'
import cmd from './publishers/cmd.js'

// Publisher registry. Order = publish order; teardown walks it in reverse.
const publishers = [meta, npm, ghRelease, ghPages, changelog, cmd]

export const run = async ({cwd = process.cwd(), env, flags = {}} = {}) => within(async () => {
  const {version: zbrVersion} = createRequire(import.meta.url)('../../../../package.json')
  if (flags.v || flags.version) {
    console.log(zbrVersion)
    return
  }

  const context = await createContext({flags, env, cwd})
  const {report, packages, queue, prev, graphs} = context
  context.run = queuefy(exec, flags.concurrency || os.cpus().length)
  context.publishers = publishers

  report
    .log()(`zx-bulk-release@${zbrVersion}`)
    .log()('queue:', queue)
    .log()('graphs', graphs)

  // --recover: standalone mode — clean orphan tags and exit.
  // Run the full pipeline again after this to rebuild and publish affected packages.
  if (flags.recover) {
    await fetchTags(cwd)
    let recovered = 0
    for (const name of queue) {
      const pkg = packages[name]
      await contextify(pkg, context)
      if (await recover(pkg, context)) recovered++
    }
    report.log()(`recover: cleaned ${recovered} orphan tag(s)`)
    return
  }

  try {
    await traverseQueue({queue, prev, cb: (name) => within(async () => {
      $.scope = name
      report.setStatus('analyzing', name)
      const pkg = packages[name]
      await contextify(pkg, context)
      await analyze(pkg, context)
      report
        .set('config', pkg.config, name)
        .set('version', pkg.version, name)
        .set('prevVersion', pkg.latest.tag?.version || pkg.manifest.version, name)
        .set('releaseType', pkg.releaseType, name)
        .set('tag', pkg.tag, name)
    })})

    report.setStatus('pending')

    await traverseQueue({queue, prev, cb: (name) => within(async () => {
      $.scope = name
      const pkg = packages[name]

      if (!pkg.releaseType) {
        report.setStatus('skipped', name)
        pkg.skipped = true
        return
      }
      if (flags.build !== false) {
        report.setStatus('building', name)
        await build(pkg, context)
      }
      if (flags.test !== false) {
        report.setStatus('testing', name)
        await test(pkg, context)
      }
      if (!flags.dryRun && flags.publish !== false) {
        report.setStatus('publishing', name)
        await publish(pkg, context)
      }

      report.setStatus('success', name)
    })})
  } catch (e) {
    report
      .log({level: 'error'})(e, e.stack)
      .set('error', e)
      .setStatus('failure')
    throw e
  } finally {
    await clean(null, context)
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
  $.quiet =         !$.verbose

  return {
    report,
    packages,
    root,
    queue,
    prev,
    graphs,
    flags,
    env,
    cwd,
  }
}
