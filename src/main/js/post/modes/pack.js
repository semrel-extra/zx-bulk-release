import {$, within, path} from 'zx-extra'

import {log} from '../log.js'
import {traverseQueue} from '../depot/deps.js'
import {contextify} from '../depot/steps/contextify.js'
import {analyze} from '../depot/steps/analyze.js'
import {build} from '../depot/steps/build.js'
import {pack} from '../depot/steps/pack.js'
import {publish} from '../depot/steps/publish.js'
import {clean} from '../depot/steps/clean.js'
import {test} from '../depot/steps/test.js'
import {preflight} from '../depot/reconcile.js'
import {CONTEXT_FILE, readContext} from '../depot/context.js'
import {buildDirective, PARCELS_DIR} from '../parcel/index.js'

export const runPack = async ({cwd, env, flags}, ctx) => {
  const {report, packages, queue, prev} = ctx

  // When running in split pipeline (receive → pack → deliver),
  // the context file is the source of truth for what to release.
  const contextFilter = await loadContextFilter(cwd, flags)

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

    const packed = []
    await forEachPkg(async (pkg) => {
      if (contextFilter) {
        // Split pipeline: context is the source of truth
        const ctxPkg = contextFilter[pkg.name]
        if (!ctxPkg) { pkg.skipped = true; return report.setStatus('skipped', pkg.name) }
        pkg.version = ctxPkg.version
        pkg.tag = ctxPkg.tag
        pkg.manifest.version = ctxPkg.version
        pkg.contextChannels = ctxPkg.channels
        if (!pkg.releaseType) pkg.releaseType = 'patch'
      } else {
        // Standalone: own analysis decides
        if (!pkg.releaseType) { pkg.skipped = true; return report.setStatus('skipped', pkg.name) }
        if (await preflight(pkg, pkg.ctx) === 'skip') { pkg.skipped = true; return report.setStatus('skipped', pkg.name) }
      }

      if (flags.build !== false) { report.setStatus('building',  pkg.name); await build(pkg) }
      if (flags.test  !== false) { report.setStatus('testing',   pkg.name); await test(pkg)  }
      if (flags.dryRun || flags.publish === false) return report.setStatus('success', pkg.name)

      report.setStatus('packing',    pkg.name); await pack(pkg)
      if (flags.pack) { packed.push(pkg); return report.setStatus('packed', pkg.name) }

      report.setStatus('publishing', pkg.name); await publish(pkg)
      report.setStatus('success',    pkg.name)
    })

    if (flags.pack && packed.length) {
      const outputDir = path.resolve(ctx.cwd, typeof flags.pack === 'string' ? flags.pack : PARCELS_DIR)
      await buildDirective(ctx, packed, outputDir)
    }
  } catch (e) {
    report.error(e, e.stack).set('error', e).setStatus('failure')
    throw e
  } finally {
    await clean(ctx)
  }
  report.setStatus('success').log('Great success!')
}

const loadContextFilter = async (cwd, flags) => {
  if (!flags.pack) return null
  try {
    const context = await readContext(path.resolve(cwd, CONTEXT_FILE))
    if (context.status === 'proceed') {
      log.info(`using context as package filter (${Object.keys(context.packages).length} package(s))`)
      return context.packages
    }
  } catch { /* no context file — standalone mode */ }
  return null
}
