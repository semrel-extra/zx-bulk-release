import {$, tempy, within, path, semver, fs} from 'zx-extra'
import {unpackTar} from '../tar.js'
import {log} from '../log.js'
import {scanDirectives, invalidateOrphans} from './directive.js'
import {tryLock, unlock, signalRebuild} from './semaphore.js'
import gitTag from './channels/git-tag.js'
import meta from './channels/meta.js'
import npm from './channels/npm.js'
import ghRelease from './channels/gh-release.js'
import ghPages from './channels/gh-pages.js'
import changelog from './channels/changelog.js'
import cmd from './channels/cmd.js'

export {buildParcels} from './parcel.js'

export const channels = {'git-tag': gitTag, meta, npm, 'gh-release': ghRelease, 'gh-pages': ghPages, changelog, cmd}
export const defaultOrder = ['git-tag', 'meta', 'npm', 'gh-release', 'gh-pages', 'changelog', 'cmd']

export const prepare = async (names, pkg) => {
  for (const n of names) await channels[n]?.prepare?.(pkg)
}

export const runChannel = async (name, ...args) => channels[name]?.run(...args)

export const resolveManifest = (manifest, env = process.env) => {
  const resolved = {}
  for (const [k, v] of Object.entries(manifest))
    resolved[k] = typeof v === 'string' ? v.replace(/\$\{\{(\w+)\}\}/g, (_, n) => env[n] || '') : v

  const {repoHost, repoName, originUrl} = resolved
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || ''
  const user = env.GH_USER || env.GH_USERNAME || env.GITHUB_USER || env.GITHUB_USERNAME || 'x-access-token'

  if (repoHost && repoName && token) {
    resolved.repoAuthedUrl = `https://${user}:${token}@${repoHost}/${repoName}.git`
    resolved.ghBasicAuth = `${user}:${token}`
  } else if (originUrl) {
    resolved.repoAuthedUrl = originUrl
  }

  return resolved
}

const MARKERS = new Set(['released', 'skip', 'conflict', 'orphan'])

const openParcel = async (tarPath, env) => {
  const content = await fs.readFile(tarPath, 'utf8').catch(() => null)
  if (MARKERS.has(content)) return null

  const destDir = tempy.temporaryDirectory()
  const {manifest} = await unpackTar(tarPath, destDir)
  const resolved = resolveManifest(manifest, env)
  const ch = channels[resolved.channel]

  if (!ch) return {warn: `unknown channel '${resolved.channel || '<none>'}'`}

  const reqs = typeof ch.requires === 'function' ? ch.requires(resolved) : (ch.requires || [])
  const missing = reqs.filter(f => !resolved[f])
  if (missing.length) return {warn: `missing credentials — ${missing.join(', ')}`, tarPath}

  return {ch, resolved, destDir, tarPath}
}

const pool = async (tasks, concurrency, fn) => {
  const active = new Set()
  let i = 0
  await new Promise((resolve, reject) => {
    const next = () => {
      if (i >= tasks.length && active.size === 0) return resolve()
      while (active.size < concurrency && i < tasks.length) {
        const t = tasks[i++]
        const p = fn(t).then(() => { active.delete(p); next() }, reject)
        active.add(p)
      }
    }
    next()
  })
}

export const inspect = async (tars, env = process.env) => {
  const parcels = []
  const skipped = []

  for (const tarPath of tars) {
    const fname = path.basename(tarPath)
    try {
      const p = await openParcel(tarPath, env)
      if (!p) continue
      if (p.warn) {
        skipped.push({file: fname, reason: p.warn, tarPath: p.tarPath})
        continue
      }
      parcels.push(p)
    } catch (e) {
      skipped.push({file: fname, reason: e.message})
    }
  }

  const groups = new Map()
  for (const p of parcels) {
    const key = p.resolved.name || p.resolved.channel
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }
  for (const g of groups.values())
    g.sort((a, b) => semver.compare(a.resolved.version || '0.0.0', b.resolved.version || '0.0.0'))

  return {groups, skipped, total: tars.length, pending: parcels.length}
}

// --- Legacy deliver (no directive) ---

const deliverLegacy = async (tars, env, {concurrency, dryRun}) => {
  const {groups, skipped, total, pending} = await inspect(tars, env)

  for (const {file, reason, tarPath} of skipped) {
    log.warn(`skipping ${file}: ${reason}`)
    if (!dryRun && tarPath) await fs.writeFile(tarPath, 'skip')
  }

  const entries = []
  const toEntry = ({resolved}) => ({channel: resolved.channel, name: resolved.name, version: resolved.version})

  if (dryRun) {
    for (const group of groups.values())
      for (const p of group)
        entries.push(toEntry(p))
    return {total, pending: entries.length, delivered: 0, skipped: skipped.length, entries}
  }

  await pool([...groups.values()], concurrency, async (group) => {
    for (const {ch, resolved, destDir, tarPath} of group) {
      await within(async () => {
        $.scope = resolved.name || resolved.channel
        await ch.run(resolved, destDir)
        log.info(`${resolved.channel} ${resolved.version}`)
      })
      await fs.writeFile(tarPath, 'released')
      entries.push(toEntry({resolved}))
    }
  })

  return {total, pending, delivered: entries.length, skipped: skipped.length, entries}
}

// --- Directive-aware deliver ---

const deliverParcel = async (tarPath, channelName, pkgName, version, env, {dryRun}) => {
  const p = await openParcel(tarPath, env)
  if (!p) return 'already'
  if (p.warn) {
    log.warn(`skipping ${p.warn}`)
    return 'skip'
  }

  if (dryRun) return 'dryrun'

  const {ch, resolved, destDir} = p
  const res = await within(async () => {
    $.scope = pkgName
    const r = await ch.run(resolved, destDir)
    log.info(`${channelName} ${version}`)
    return r
  })

  if (res === 'conflict') return 'conflict'

  await fs.writeFile(tarPath, 'released')
  return res === 'duplicate' ? 'duplicate' : 'ok'
}

const deliverDirective = async (directive, tarMap, env, {dryRun}) => {
  const entries = []
  const conflicts = []
  const skipped = []

  for (const pkgName of directive.queue) {
    const pkg = directive.packages[pkgName]
    if (!pkg) continue

    let pkgConflict = false

    for (const step of pkg.deliver) {
      if (pkgConflict) break

      const results = await Promise.all(step.map(async (channelName) => {
        const parcelName = (pkg.parcels || []).find(p => p.includes(`.${channelName}.`))
        const tarPath = parcelName && tarMap.get(parcelName)
        if (!tarPath) return 'missing'

        return deliverParcel(tarPath, channelName, pkgName, pkg.version, env, {dryRun})
      }))

      for (let i = 0; i < step.length; i++) {
        const r = results[i]
        if (r === 'skip') skipped.push({channelName: step[i], pkg: pkgName})
        else if (r !== 'missing' && r !== 'already') entries.push({channel: step[i], name: pkgName, version: pkg.version})
      }

      if (results.includes('conflict')) {
        pkgConflict = true
        conflicts.push(pkgName)
        for (const p of pkg.parcels || []) {
          const tp = tarMap.get(p)
          if (!tp) continue
          const c = await fs.readFile(tp, 'utf8').catch(() => null)
          if (c !== 'released') await fs.writeFile(tp, 'conflict')
        }
      }
    }
  }

  return {entries, conflicts, skipped}
}

// --- Main entry point ---

export const deliver = async (tars, env = process.env, {concurrency = 4, dryRun = false, cwd} = {}) => {
  const dir = tars.length ? path.dirname(tars[0]) : null
  const directives = dir ? await scanDirectives(dir) : []

  if (!directives.length) return deliverLegacy(tars, env, {concurrency, dryRun})

  const tarMap = new Map(tars.map(t => [path.basename(t), t]))
  const allEntries = []
  const allConflicts = []
  const allSkipped = []

  for (const directive of directives) {
    const gitRoot = cwd || dir
    if (!await tryLock(gitRoot, directive)) {
      log.info(`directive ${directive.sha.slice(0, 7)} locked, skipping`)
      continue
    }

    try {
      await invalidateOrphans(dir, directive)
      const {entries, conflicts, skipped} = await deliverDirective(directive, tarMap, env, {dryRun})
      allEntries.push(...entries)
      allConflicts.push(...conflicts)
      allSkipped.push(...skipped)

      if (conflicts.length) {
        await fs.writeFile(directive.tarPath, 'conflict')
        await signalRebuild(gitRoot, directive.sha)
      } else if (!skipped.length) {
        await fs.writeFile(directive.tarPath, 'released')
      }
    } finally {
      await unlock(gitRoot, directive)
    }
  }

  return {
    total: tars.length,
    pending: allEntries.length,
    delivered: allEntries.length,
    skipped: allSkipped.length,
    entries: allEntries,
    conflicts: allConflicts,
  }
}
