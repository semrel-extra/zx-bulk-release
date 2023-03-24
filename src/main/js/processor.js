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
  const context = await createContext({flags, env, cwd})
  const {report, build, publish, packages, queue, prev, graphs} = context

  report
    .log()('zx-bulk-release')
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
        return
      }
      if (!flags.noBuild) {
        report.setStatus('building', name)
        await build(pkg)
      }
      if (!flags.dryRun && !flags.noPublish) {
        report.setStatus('publishing', name)
        await publish(pkg)
      }

      report.setStatus('success', name)
    }})
  } catch (e) {
    report
      .log({level: 'error'})(e, e.stack)
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
    return $.o({cwd: pkg.absPath, quote: v => v, preferLocal: true})`${cmd}`
  }
}

const createContext = async ({flags, env, cwd}) => {
  const { packages, queue, root, prev, graphs } = await topo({cwd, flags})
  const report =    createReport({packages, queue, flags})
  const run =       queuefy(runCmd, flags.concurrency || os.cpus().length)
  const _build =    memoizeBy((pkg) => build(pkg, run, _build, flags))
  const _publish =  memoizeBy((pkg) => publish(pkg, run))

  $.report =        report
  $.env =           {...process.env, ...env}
  $.verbose =       !!(flags.debug || $.env.DEBUG ) || $.verbose

  return {
    report,
    build: _build,
    publish: _publish,
    packages,
    root,
    queue,
    prev,
    graphs
  }
}

// Inspired by https://docs.github.com/en/actions/learn-github-actions/contexts
const contextify = async (pkg, {packages, root}) => {
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

const build = async (pkg, run = runCmd, self = build, flags = {}) => within(async () => {
  $.scope = pkg.name

  await Promise.all([
    traverseDeps(pkg, pkg.context.packages, async (_, {pkg}) => self(pkg, run, self, flags)),
    pkg.changes.length === 0 && pkg.config.npmFetch && !flags.noNpmFetch
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

  pkg.published = true
})
