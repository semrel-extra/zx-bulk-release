import {$, within} from 'zx-extra'

import {api} from '../api/index.js'
import {log} from '../log.js'
import {traverseQueue} from '../depot/deps.js'
import {contextify} from '../depot/steps/contextify.js'
import {analyze} from '../depot/steps/analyze.js'
import {clean} from '../depot/steps/clean.js'
import {preflight} from '../depot/reconcile.js'
import {consumeRebuildSignal} from '../courier/semaphore.js'
import {getActiveChannels} from '../courier/index.js'
import {writeContext, buildContext} from '../depot/context.js'
import {getLatest} from '../depot/generators/meta.js'

export const runReceive = async ({cwd, env, flags}, ctx) => {
  const {report, packages, queue, prev} = ctx

  const sha = await api.git.getSha(cwd)
  const sha7 = sha.slice(0, 7)

  if (api.gh.isRebuildTrigger(env) && !flags.dryRun) {
    const result = await consumeRebuildSignal(cwd, sha)
    if (result?.exitCode !== 0 && result?.stderr?.includes('remote ref does not exist')) {
      log.info(`rebuild signal already consumed by another process`)
      await writeContext(cwd, {status: 'skip', reason: 'rebuild claimed by another process'})
      api.gh.setOutput('status', 'skip')
      return report.setStatus('success')
    }
    log.info(`consumed rebuild signal for ${sha7}`)
  }

  const forEachPkg = (cb) => traverseQueue({queue, prev, cb: (name) => within(async () => {
    $.scope = name
    await contextify(packages[name], ctx)
    return cb(packages[name])
  })})

  try {
    // Phase 1: analyze all packages
    await forEachPkg(async (pkg) => {
      report.setStatus('analyzing', pkg.name)
      await analyze(pkg)
    })

    // Phase 2: preflight — may fetch remote tags and re-resolve versions
    let tagsFetched = false
    await forEachPkg(async (pkg) => {
      if (!pkg.releaseType) { pkg.skipped = true; return }
      const result = await preflight(pkg, pkg.ctx)
      if (result === 'skip') { pkg.skipped = true; return }
      if (result === 'refetch') tagsFetched = true
    })

    // Phase 3: if preflight fetched tags, dependency cascade may have changed —
    // re-analyze packages that had no changes on the first pass.
    if (tagsFetched) {
      log.info('tags fetched during preflight, re-analyzing for dependency cascades')
      for (const name of queue) {
        const pkg = packages[name]
        if (pkg.releaseType) continue
        pkg.latest = await getLatest(pkg)
      }

      await forEachPkg(async (pkg) => {
        if (pkg.releaseType) return
        pkg.skipped = false
        report.setStatus('re-analyzing', pkg.name)
        await analyze(pkg)
        if (!pkg.releaseType) { pkg.skipped = true; return }
        if (await preflight(pkg, pkg.ctx) === 'skip') { pkg.skipped = true }
      })
    }

    const snapshot = !!flags.snapshot
    const context = buildContext(packages, queue, sha, {
      getChannels: (pkg) => getActiveChannels(pkg, ctx.channels, snapshot),
    })
    await writeContext(cwd, context)

    const count = Object.keys(context.packages).length
    if (count === 0) {
      log.info('nothing to release')
      await writeContext(cwd, {status: 'skip', reason: 'nothing to release'})
      api.gh.setOutput('status', 'skip')
    } else {
      log.info(`${count} package(s) to release`)
      api.gh.setOutput('status', 'proceed')
    }
  } catch (e) {
    report.error(e, e.stack).setStatus('failure')
    throw e
  } finally {
    await clean(ctx)
  }

  report.setStatus('success')
}
