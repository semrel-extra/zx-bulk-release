import {$, tempy, within, path, semver, fs} from 'zx-extra'
import {unpackTar} from '../tar.js'
import {log} from '../log.js'
import meta from './channels/meta.js'
import npm from './channels/npm.js'
import ghRelease from './channels/gh-release.js'
import ghPages from './channels/gh-pages.js'
import changelog from './channels/changelog.js'
import cmd from './channels/cmd.js'

export {buildParcels} from './parcel.js'

export const channels = {meta, npm, 'gh-release': ghRelease, 'gh-pages': ghPages, changelog, cmd}
export const defaultOrder = ['meta', 'npm', 'gh-release', 'gh-pages', 'changelog', 'cmd']

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

const openParcel = async (tarPath, env) => {
  const content = await fs.readFile(tarPath, 'utf8').catch(() => null)
  if (content === 'released' || content === 'skip') return null

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

// Parcels grouped by package, sorted by semver asc (latest last).
// Groups run in parallel (concurrency-limited), entries within a group — sequential.
export const deliver = async (tars, env = process.env, {concurrency = 4} = {}) => {
  const groups = new Map()

  for (const tarPath of tars) {
    const fname = path.basename(tarPath)
    try {
      const p = await openParcel(tarPath, env)
      if (!p) continue
      if (p.warn) {
        log.warn(`skipping ${fname}: ${p.warn}`)
        if (p.tarPath) await fs.writeFile(tarPath, 'skip')
        continue
      }
      const key = p.resolved.name || p.resolved.channel
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(p)
    } catch (e) {
      log.warn(`skipping ${fname}: ${e.message}`)
    }
  }

  for (const g of groups.values())
    g.sort((a, b) => semver.compare(a.resolved.version || '0.0.0', b.resolved.version || '0.0.0'))

  let delivered = 0
  await pool([...groups.values()], concurrency, async (group) => {
    for (const {ch, resolved, destDir, tarPath} of group) {
      await within(async () => {
        $.scope = resolved.name || resolved.channel
        await ch.run(resolved, destDir)
      })
      await fs.writeFile(tarPath, 'released')
      delivered++
    }
  })

  return delivered
}
