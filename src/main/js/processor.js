import os from 'node:os'
import {createRequire} from 'node:module'
import {$, within} from 'zx-extra'
import {queuefy} from 'queuefy'
import {analyze} from './analyze.js'
import {pushChangelog} from './changelog.js'
import {getPkgConfig} from './config.js'
import {topo, traverseDeps, traverseQueue} from './deps.js'
import {ghPages, ghRelease} from './gh.js'
import {getRoot, getSha, unsetUserConfig} from './git.js'
import {log, createReport} from './log.js'
import {getLatest, prepareMeta, pushMeta, pushReleaseTag} from './meta.js'
import {fetchPkg, npmPersist, npmPublish, npmRestore} from './npm.js'
import {memoizeBy, tpl} from './util.js'

export const run = async ({cwd = process.cwd(), env, flags = {}} = {}) => within(async () => {
  const {version: zbrVersion} = createRequire(import.meta.url)('../../../package.json')
  if (flags.v || flags.version) {
    console.log(zbrVersion)
    return
  }

  const context = await createContext({flags, env, cwd})
  const {report, packages, queue, prev, graphs} = context
  const _runCmd = queuefy(runCmd, flags.concurrency || os.cpus().length)

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
        return
      }
      if (flags.build !== false) {
        report.setStatus('building', name)
        await build(pkg, _runCmd)
      }
      if (!flags.dryRun && flags.publish !== false) {
        report.setStatus('publishing', name)
        await publish(pkg, _runCmd)
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

export const runCmd = async (pkg, name) => {
  const cmd = tpl(pkg.config[name], {...pkg, ...pkg.context})
  const now = Date.now()

  if (cmd) {
    log({pkg})(`run ${name} '${cmd}'`)
    const result = await $.o({cwd: pkg.absPath, quote: v => v, preferLocal: true})`${cmd}`

    log({pkg})(`duration ${name}: ${Date.now() - now}`)
    return result
  }
}

const createContext = async ({flags, env, cwd}) => {
  const { packages, queue, root, prev, graphs } = await topo({cwd, flags})
  const report =    createReport({packages, queue, flags})

  $.report =        report
  $.env =           {...process.env, ...env}
  $.verbose =       !!(flags.debug || $.env.DEBUG ) || $.verbose

  return {
    report,
    packages,
    root,
    queue,
    prev,
    graphs,
    flags
  }
}

// Inspired by https://docs.github.com/en/actions/learn-github-actions/contexts
const contextify = async (pkg, {packages, root, flags}) => {
  pkg.config = await getPkgConfig(pkg.absPath, root.absPath)
  pkg.latest = await getLatest(pkg)
  pkg.context = {
    git: {
      sha: await getSha(pkg.absPath),
      root: await getRoot(pkg.absPath)
    },
    env: $.env,
    flags,
    packages
  }
}

const build = memoizeBy(async (pkg, run = runCmd, flags = {}, self = build) => within(async () => {
  $.scope = pkg.name

  await Promise.all([
    traverseDeps({pkg, packages: pkg.context.packages, cb: async({pkg}) => self(pkg, run, flags, self)}),
    pkg.manifest.private !== true && pkg.changes.length === 0 && pkg.config.npmFetch && flags.npmFetch !== false
      ? fetchPkg(pkg)
      : Promise.resolve()
  ])

  if (!pkg.fetched) {
    await run(pkg, 'buildCmd')
    await run(pkg, 'testCmd')
  }

  pkg.built = true
}))

const publish = memoizeBy(async (pkg, run = runCmd) => within(async () => {
  $.scope = pkg.name

  // Debug
  // https://www.npmjs.com/package/@packasso/preset-ts-tsc-uvu/v/0.0.0?activeTab=code
  // https://github.com/qiwi/packasso/actions/runs/4514909191/jobs/7951564982#step:7:817
  // https://github.com/qiwi/packasso/blob/meta/2023-3-24-packasso-preset-ts-tsc-uvu-0-21-0-f0.json
  if (pkg.version !== pkg.manifest.version) {
    throw new Error('package.json version not synced')
  }

  await npmPersist(pkg)
  await prepareMeta(pkg)

  if (pkg.context.flags.snapshot) {
    await Promise.all([
      npmPublish(pkg),
      run(pkg, 'publishCmd')
    ])
  } else {
    await pushReleaseTag(pkg)
    await Promise.all([
      pushMeta(pkg),
      pushChangelog(pkg),
      npmPublish(pkg),
      ghRelease(pkg),
      ghPages(pkg),
      run(pkg, 'publishCmd')
    ])
  }
  pkg.published = true
}))

const clean = async (cwd, packages) => {
  await unsetUserConfig(cwd)
  await Promise.all(Object.values(packages).map(npmRestore))
}
