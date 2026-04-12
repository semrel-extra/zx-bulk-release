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
import {buildDirective, PARCELS_DIR} from '../parcel/index.js'

export const runPack = async ({cwd, env, flags}, ctx) => {
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

    const packed = []
    await forEachPkg(async (pkg) => {
      if (!pkg.releaseType) { pkg.skipped = true; return report.setStatus('skipped', pkg.name) }
      if (await preflight(pkg, pkg.ctx) === 'skip') { pkg.skipped = true; return report.setStatus('skipped', pkg.name) }
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
