// Courier: sealed delivery of release artifacts.
//
// Owns the channel registry. Depot references channels by name,
// never by direct import — courier is the single place that knows how to
// resolve a name like 'npm' or 'gh-release' into runnable code.
//
// deliver() unpacks tar containers, resolves credential templates from env,
// and hands each channel a resolved manifest + unpacked directory.

import {tempy} from 'zx-extra'
import {log} from '../log.js'
import {unpackTar} from '../tar.js'
import meta from './channels/meta.js'
import npm from './channels/npm.js'
import ghRelease from './channels/gh-release.js'
import ghPages from './channels/gh-pages.js'
import changelog from './channels/changelog.js'
import cmd from './channels/cmd.js'

export {buildParcel} from './parcel.js'

// Channel registry, keyed by name.
export const channels = {meta, npm, 'gh-release': ghRelease, 'gh-pages': ghPages, changelog, cmd}

// Default channel order. Depot passes this into ctx.
export const defaultOrder = ['meta', 'npm', 'gh-release', 'gh-pages', 'changelog', 'cmd']

// Which of `names` are active for this pkg + snapshot combo.
export const filterActive = (names, pkg, {snapshot = false} = {}) =>
  names.filter(n => {
    const ch = channels[n]
    return ch && (!snapshot || ch.snapshot) && ch.when(pkg)
  })

// Run prepare phase for named channels (serial — order matters).
export const prepare = async (names, pkg) => {
  for (const n of names) await channels[n]?.prepare?.(pkg)
}

// Run a single channel by name. Extra args forwarded (cmd needs exec).
export const runChannel = async (name, ...args) => channels[name]?.run(...args)

// Undo channels in reverse order (for teardown).
export const undo = async (names, pkg, opts) => {
  for (const n of [...names].reverse()) {
    const ch = channels[n]
    if (!ch?.undo || !ch.when(pkg)) continue
    try {
      const result = await ch.undo(pkg, opts)
      if (result !== false) log.info(`${opts.reason}: ${ch.name} undone for '${opts.tag}'`)
    } catch (e) {
      log.warn(`${opts.reason}: ${ch.name} undo failed`, e)
    }
  }
}

// Resolve ${{ENV_VAR}} placeholders in manifest values from env.
export const resolveTemplates = (manifest, env = process.env) => {
  const resolved = {}
  for (const [k, v] of Object.entries(manifest)) {
    if (typeof v === 'string') {
      resolved[k] = v.replace(/\$\{\{(\w+)\}\}/g, (_, name) => env[name] || '')
    } else {
      resolved[k] = v
    }
  }
  return resolved
}

// Build repoAuthedUrl from manifest fields + env.
const resolveRepoAuthedUrl = (manifest, env = process.env) => {
  const {repoHost, repoName} = manifest
  if (!repoHost || !repoName) return undefined
  const user = env.GH_USER || env.GH_USERNAME || env.GITHUB_USER || env.GITHUB_USERNAME || 'x-access-token'
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || ''
  return token ? `https://${user}:${token}@${repoHost}/${repoName}.git` : undefined
}

// Deliver sealed tar containers. cmd is excluded — it runs depot-side.
// Each channel receives a resolved manifest and an unpacked directory.
export const deliver = async (tars, env = process.env) => {
  const entries = Object.entries(tars).filter(([n]) => n !== 'cmd')

  await Promise.all(
    entries.map(async ([name, tarPath]) => {
      const ch = channels[name]
      if (!ch) return

      const destDir = tempy.temporaryDirectory()
      const {manifest} = await unpackTar(tarPath, destDir)
      const resolved = resolveTemplates(manifest, env)

      // Inject repoAuthedUrl for channels that need git push.
      // For standard GitHub repos: build from repoHost + repoName + env tokens.
      // For local repos (tests): fall back to originUrl stored in manifest.
      if (resolved.repoHost) {
        resolved.repoAuthedUrl = resolveRepoAuthedUrl(resolved, env) || resolved.originUrl
        resolved.ghBasicAuth = `${env.GH_USER || env.GH_USERNAME || 'x-access-token'}:${env.GH_TOKEN || env.GITHUB_TOKEN || ''}`
      } else if (resolved.originUrl) {
        resolved.repoAuthedUrl = resolved.originUrl
      }

      await ch.run(resolved, destDir)
    })
  )
}
