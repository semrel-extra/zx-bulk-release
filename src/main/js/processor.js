import os from 'node:os'
import {$, fs, within} from 'zx-extra'
import {queuefy} from 'queuefy'
import {analyze} from './analyze.js'
import {pushChangelog} from './changelog.js'
import {getPkgConfig} from './config.js'
import {topo, traverseDeps, traverseQueue} from './deps.js'
import {ghPages, ghRelease} from './gh.js'
import {getRoot, getSha} from './git.js'
import {log, createReport} from './log.js'
import {getLatest, pushMeta, pushTag} from './meta.js'
import {fetchPkg, npmPublish} from './npm.js'
import {memoizeBy, tpl} from './util.js'

export const run = async ({cwd = process.cwd(), env, flags = {}} = {}) => within(async () => {
  const {report, build, publish} = createContext(flags, env)

  report.log()('zx-bulk-release')

  try {
    const {packages, queue, root, prev, graphs} = await topo({cwd, flags})
    report
      .log()('queue:', queue)
      .log()('graphs', graphs)
      .set('queue', queue)
      .setPackages(packages)

    await traverseQueue({queue, prev, async cb(name) {
      report.setStatus('analyzing', name)
      const pkg = packages[name]
      await contextify(pkg, packages, root)
      await analyze(pkg, packages)
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
        return
      }

      report.setStatus('building', name)
      await build(pkg, packages)

      if (flags.dryRun) {
        report.setStatus('success', name)
        return
      }

      report.setStatus('publishing', name)
      await publish(pkg)

      report.setStatus('success', name)
    }})
  } catch (e) {
    report
      .log({level: 'error'})(e)
      .set('error', e)
      .setStatus('failure')
    throw e
  }
  report
    .setStatus('success')
    .log()('Great success!')
})

export const runCmd = async (pkg, name) => {
  const cmd = tpl(pkg.config[name], {...pkg, ...pkg.context})

  if (cmd) {
    log({pkg})(`run ${name} '${cmd}'`)
    await $.o({cwd: pkg.absPath, quote: v => v, preferLocal: true})`${cmd}`
  }
}

const createContext = (flags, env) => {
  const report = createReport({file: flags.report})
  const _runCmd = queuefy(runCmd, flags.concurrency || os.cpus().length)
  const _build = memoizeBy((pkg, packages) => build(pkg, packages, _runCmd, _build))
  const _publish = memoizeBy((pkg) => publish(pkg, _runCmd))

  $.report = report
  $.env = {...process.env, ...env}
  $.verbose = !!(flags.debug || $.env.DEBUG ) || $.verbose

  return {
    report,
    runCmd: _runCmd,
    build: _build,
    publish: _publish
  }
}

// Inspired by https://docs.github.com/en/actions/learn-github-actions/contexts
const contextify = async (pkg, packages, root) => {
  pkg.config = await getPkgConfig(pkg.absPath, root.absPath)
  pkg.latest = await getLatest(pkg)
  pkg.context = {
    git: {
      sha: await getSha(pkg.absPath),
      root: await getRoot(pkg.absPath)
    },
    env: $.env,
    packages
  }
}

const build = async (pkg, packages, run = runCmd, self = build) => within(async () => {
  $.scope = pkg.name
  if (pkg.built) return

  await Promise.all([
    traverseDeps(pkg, packages, async (_, {pkg}) => self(pkg, packages, run, self)),
    pkg.changes.length === 0 && pkg.config.npmFetch
      ? fetchPkg(pkg)
      : Promise.resolve()
  ])

  if (!pkg.fetched) {
    await run(pkg, 'buildCmd')
    await run(pkg, 'testCmd')
  }

  pkg.built = true
})

const publish = async (pkg, run = runCmd) => within(async () => {
  $.scope = pkg.name
  await fs.writeJson(pkg.manifestPath, pkg.manifest, {spaces: 2})
  await pushTag(pkg)

  await Promise.all([
    pushMeta(pkg),
    pushChangelog(pkg),
    npmPublish(pkg),
    ghRelease(pkg),
    ghPages(pkg),
    run(pkg, 'publishCmd')
  ])
})
