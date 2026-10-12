// What the courier is about to deliver: parcels read for this env and arranged into packages.
// Nothing here touches a remote; the plan is all a dry run does.

import {path, semver} from 'zx-extra'
import {topoOrder} from '../../util.js'
import {readManifest, readMarker} from '../tar.js'
import {log} from '../log.js'
import {parcelChannel} from '../parcel/directive.js'
import {PLACEHOLDER, mergePopulate, assertPopulate, checkManifest} from '../parcel/populate.js'
import {channels, stageOf} from './channels/index.js'

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

export const ghAuth = (env) => {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN
  const user = ['GH_USER', 'GH_USERNAME', 'GITHUB_USER', 'GITHUB_USERNAME'].map(k => env[k]).find(Boolean) || 'x-access-token'
  return token ? `${user}:${token}` : ''
}

export const resolveManifest = (manifest, env = process.env) => {
  // Credentials-bearing fields are derived below, never taken from the parcel.
  const {repoAuthedUrl, ghBasicAuth, ...fields} = manifest
  // fromEntries defines own properties: a `__proto__` key stays a plain field and can't swap the prototype
  const resolved = Object.fromEntries(Object.entries(fields).map(([k, v]) =>
    [k, typeof v === 'string' ? v.replace(PLACEHOLDER, (_, n) => env[n] || '') : v]))

  const {repoHost, repoName, originUrl} = resolved
  const auth = ghAuth(env)

  if (repoHost && repoName && auth) {
    resolved.repoAuthedUrl = `https://${auth}@${repoHost}/${repoName}.git`
    resolved.ghBasicAuth = auth
  } else if (originUrl) {
    resolved.repoAuthedUrl = originUrl
  }

  return resolved
}

// Manifest fields the channel needs to run, but that are empty after resolution.
export const missingRequires = (ch, resolved) =>
  (typeof ch.requires === 'function' ? ch.requires(resolved) : (ch.requires || [])).filter(f => !resolved[f])

const populateErrors = (manifest, resolved) => {
  if (own(manifest, '__proto__')) return ['__proto__: is not allowed']
  try {
    const populate = manifest.populate ? assertPopulate(manifest.populate) : mergePopulate()
    return checkManifest({values: resolved, channel: resolved.channel, populate})
  } catch (e) {
    return [e.message]
  }
}

// Parcel: {file, tarPath, state, stage, ch, resolved, reason}
//   state: ready | released | conflict (markers) | held (not deliverable by this env) | invalid (breaks its rules)
//          | dropped (3.x skip and orphan markers: nothing is left to deliver)
//   Every parcel has a stage, so no parcel, however broken, slips past the claim of its package.
const MARKER_STATES = {released: 'released', conflict: 'conflict', skip: 'dropped', orphan: 'dropped'}

export const openParcel = async (tarPath, env) => {
  const file = path.basename(tarPath)
  const stage = stageOf(parcelChannel(file))
  const marker = await readMarker(tarPath)
  if (marker) return {file, tarPath, stage, state: MARKER_STATES[marker]}

  const manifest = await readManifest(tarPath).catch(() => null)
  if (!manifest || typeof manifest !== 'object') return {file, tarPath, stage, state: 'invalid', reason: 'unreadable manifest'}

  const resolved = resolveManifest(manifest, env)
  const ch = own(channels, resolved.channel) ? channels[resolved.channel] : undefined
  return {file, tarPath, resolved, ch, stage: ch ? stageOf(resolved.channel) : stage, ...checkParcel(ch, manifest, resolved)}
}

// Whether this env can deliver the parcel, and whether the parcel keeps its own rules.
const checkParcel = (ch, manifest, resolved) => {
  if (!ch) return {state: 'held', reason: `unknown channel ${JSON.stringify(resolved.channel ?? null)}`}

  const missing = missingRequires(ch, resolved)
  if (missing.length) return {state: 'held', reason: `missing credentials — ${missing.join(', ')}`}

  const errors = populateErrors(manifest, resolved)
  return errors.length ? {state: 'invalid', reason: `populate rules — ${errors.join('; ')}`, errors} : {state: 'ready'}
}

export const openAll = async (tars, env) =>
  new Map((await Promise.all(tars.map(t => openParcel(t, env)))).map(p => [p.file, p]))

// A listed parcel must be there and belong to its package, so no parcel rides on another package's claim.
// A foreign parcel is reported, never marked: it is not this package's to mark.
const parcelOf = (file, name, version, opened) => {
  const p = opened.get(file)
  if (!p) return {file, state: 'held', reason: 'missing', stage: stageOf(parcelChannel(file))}
  if (p.resolved && (p.resolved.name !== name || p.resolved.version !== version))
    return {file, stage: p.stage, state: 'invalid', reason: `belongs to ${JSON.stringify(`${p.resolved.name}@${p.resolved.version}`)}, not ${name}@${version}`}
  return p
}

// Plan: {queue, prev, deps: Map<key, key[]>, packages: {[key]: Parcel[]}}
//   prev orders the queue, deps are what a package waits on: in a directive they are the same.
//   The queue follows prev wherever a package stands in it: the order is the graph's, not the list's.
export const planOf = ({queue, prev = {}, packages}, opened) => {
  const deps = new Map(Object.entries(prev))
  return {
    queue: topoOrder(queue, deps),
    prev: deps,
    deps,
    packages: Object.fromEntries(queue.map(key => {
      const {version, parcels = []} = packages[key] || {}
      return [key, parcels.map(file => parcelOf(file, key, version, opened))]
    })),
  }
}


// Without a directive a parcel belongs to the name@version its manifest names, and that package's claim gates it.
// Versions of a name go in ascending order, one at a time, yet none waits on another's outcome: they are
// releases of their own, as in 3.x. A parcel that names no package can't be gated at all: it is `unowned`.
// Markers carry no manifest and nothing to deliver.
export const looseOf = (opened) => {
  const packages = {}
  const ids = {}
  const unowned = []
  for (const p of opened.values()) {
    if (!p.resolved && p.state !== 'invalid') continue
    const {name, version} = p.resolved || {}
    if (!name || !version) {
      unowned.push(p.file)
      continue
    }
    const key = `${name}@${version}`
    ids[key] = {name, version}
    const parcels = packages[key] ??= []
    parcels.push(p)
  }
  const queue = Object.keys(packages).sort((a, b) => byVersion(ids[a], ids[b]))
  const prev = new Map()
  queue.forEach((key, i) => { if (i && ids[queue[i - 1]].name === ids[key].name) prev.set(key, [queue[i - 1]]) })
  return {queue, prev, deps: new Map(), packages, unowned}
}

const byVersion = (a, b) =>
  a.name.localeCompare(b.name) || semver.compare(semver.valid(a.version) || '0.0.0', semver.valid(b.version) || '0.0.0')

// Held and invalid parcels are named before anything runs: a failing channel must not hide them.
export const warnSkipped = (plan) => {
  const parcels = Object.values(plan.packages).flat()
  for (const p of parcels) if (p.state === 'held' || p.state === 'invalid') log.warn(`skipping ${p.file}: ${p.reason}`)
  return plan
}
