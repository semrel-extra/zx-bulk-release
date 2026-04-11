import {$, tempy, within} from 'zx-extra'
import {unpackTar} from '../tar.js'
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
  for (const [k, v] of Object.entries(manifest)) {
    resolved[k] = typeof v === 'string'
      ? v.replace(/\$\{\{(\w+)\}\}/g, (_, name) => env[name] || '')
      : v
  }

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

// Takes an array of tar paths. Each tar is self-describing via manifest.channel.
export const deliver = async (tars, env = process.env) => {
  const parcels = await Promise.all(tars.map(async (tarPath) => {
    const destDir = tempy.temporaryDirectory()
    const {manifest} = await unpackTar(tarPath, destDir)
    const resolved = resolveManifest(manifest, env)
    const ch = channels[resolved.channel]
    return ch ? {ch, resolved, destDir} : null
  }))

  const ready = parcels.filter(Boolean)

  const missing = ready.flatMap(({ch, resolved}) =>
    (ch.requires || []).filter(f => !resolved[f]).map(f => `${ch.name}: missing '${f}'`)
  )
  if (missing.length) throw new Error(`deliver: missing credentials — ${missing.join(', ')}`)

  await Promise.all(ready.map(({ch, resolved, destDir}) => within(async () => {
    $.scope = resolved.name || resolved.channel
    await ch.run(resolved, destDir)
  })))
}
