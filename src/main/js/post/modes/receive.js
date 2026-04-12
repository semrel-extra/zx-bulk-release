import nodeFs from 'node:fs'
import {$, within} from 'zx-extra'

import {log} from '../log.js'
import {traverseQueue} from '../depot/deps.js'
import {contextify} from '../depot/steps/contextify.js'
import {analyze} from '../depot/steps/analyze.js'
import {clean} from '../depot/steps/clean.js'
import {preflight} from '../depot/reconcile.js'
import {consumeRebuildSignal} from '../courier/semaphore.js'
import {writeContext, buildContext} from '../depot/context.js'
import {getSha} from '../api/git.js'

const setOutput = (name, value) => {
  const outputFile = process.env.GITHUB_OUTPUT
  if (outputFile) {
    try { nodeFs.appendFileSync(outputFile, `${name}=${value}\n`) } catch { /* not in CI */ }
  }
}

export const runReceive = async ({cwd, env, flags}, ctx) => {
  const {report, packages, queue, prev} = ctx

  const sha = await getSha(cwd)

  // try to consume rebuild signal — if it fails, another process claimed it
  const sha7 = sha.slice(0, 7)
  const isRebuild = !!(env.GITHUB_REF_TYPE === 'tag' && env.GITHUB_REF_NAME?.startsWith('zbr-rebuild.'))
  if (isRebuild) {
    const result = await consumeRebuildSignal(cwd, sha)
    if (result?.exitCode !== 0 && result?.stderr?.includes('remote ref does not exist')) {
      log.info(`rebuild signal already consumed by another process`)
      await writeContext(cwd, {status: 'skip', reason: 'rebuild claimed by another process'})
      setOutput('status', 'skip')
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
    await forEachPkg(async (pkg) => {
      report.setStatus('analyzing', pkg.name)
      await analyze(pkg)
    })

    await forEachPkg(async (pkg) => {
      if (!pkg.releaseType) { pkg.skipped = true; return }
      if (await preflight(pkg, pkg.ctx) === 'skip') { pkg.skipped = true; return }
    })

    const context = buildContext(packages, queue, sha, {
      channelNames: ctx.channels,
      snapshot: !!flags.snapshot,
    })
    await writeContext(cwd, context)

    const count = Object.keys(context.packages).length
    if (count === 0) {
      log.info('nothing to release')
      await writeContext(cwd, {status: 'skip', reason: 'nothing to release'})
      setOutput('status', 'skip')
    } else {
      log.info(`${count} package(s) to release`)
      setOutput('status', 'proceed')
    }
  } catch (e) {
    report.error(e, e.stack).setStatus('failure')
    throw e
  } finally {
    await clean(ctx)
  }

  report.setStatus('success')
}
