// What the directive lists, checked against the context: the directive decides what goes out and in which order.

import {topoOrder} from '../../util.js'
import {log} from '../log.js'
import {stageOf} from '../courier/channels/index.js'
import {parcelChannel} from './directive.js'
import {findPackage} from './build.js'

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

// A courier marks a directive released only once nothing of it is left to deliver.
export const leftoverErrors = ({names, marked}) => {
  const directive = [...names].find(n => parcelChannel(n) === 'directive')
  const live = [...names].filter(n => !marked.has(n) && parcelChannel(n) !== 'directive')
  return marked.get(directive) === 'released' && live.length ? [`directive is marked released, yet parcels are left: ${directive}`] : []
}

// The directive says what goes out and in which order. It may hold packages back, as when the phases ran with
// different flags, but what it lists is the context's: versions, tags, the dependencies, and one verified parcel
// of the package per context channel. Unlisted parcels stay orphans.
export const directiveErrors = (raw, {sha, sha7, timestamp, prev, packages}, seen) => {
  const listed = Object.keys(isMap(raw.packages) ? raw.packages : {}).sort()
  const unknown = listed.filter(n => !own(packages, n))
  if (unknown.length) return [`directive lists packages the context does not: ${unknown.map(n => JSON.stringify(n)).join(', ')}`]
  if (!listed.length) return ['directive lists no packages']

  const heldBack = Object.keys(packages).filter(n => !listed.includes(n))
  if (heldBack.length) log.warn(`directive holds back ${heldBack.join(', ')}: they are not delivered`)
  const graph = graphErrors(raw.prev, listed)
  return [
    raw.sha !== sha && 'directive sha differs from the context',
    timestamp !== undefined && raw.timestamp !== timestamp && 'directive timestamp differs from the commit time',
    !sameNames(raw.queue, listed) && 'directive queue differs from its packages',
    ...listed.flatMap(n => entryErrors(raw.packages[n], n, packages[n], seen, sha7)),
    ...graph.length ? graph : dependencyErrors(raw.prev, prev, listed),
  ].filter(Boolean)
}

const entryErrors = (entry, name, pkg, {names, marked}, sha7) => {
  if (entry?.version !== pkg.version || entry?.tag !== pkg.tag) return [`directive entry of ${name} differs from the context`]
  if (!Array.isArray(entry.parcels)) return [`directive entry of ${name} has no parcel list`]
  const owned = entry.parcels.filter(f => names.has(f) && findPackage(f, sha7, parcelChannel(f), {[name]: pkg}))
  if (owned.length !== entry.parcels.length || !sameNames(owned.map(parcelChannel), [...pkg.channels].sort()))
    return [`directive does not list one verified parcel of ${name} per channel (${pkg.channels.join(', ')})`]
  return markerErrors(owned, name, marked)
}

// A courier settles the claim first and drops no listed parcel: markers in any other place came from elsewhere.
const markerErrors = (parcels, name, marked) => {
  if (parcels.some(f => marked.get(f) === 'orphan' || marked.get(f) === 'skip')) return [`directive lists dropped parcels of ${name}`]
  const claim = parcels.find(f => stageOf(parcelChannel(f)) === 'claim')
  if (claim && !marked.has(claim) && parcels.some(f => marked.has(f))) return [`parcels of ${name} are marked before its claim`]
  return []
}

// What the directive waits on is a graph of what it lists, without cycles.
const graphErrors = (rawPrev = {}, listed) => {
  const has = new Set(listed)
  const edges = isMap(rawPrev) ? Object.entries(rawPrev) : null
  if (!edges || edges.some(([n, deps]) => !has.has(n) || !Array.isArray(deps) || deps.some(d => !has.has(d))))
    return ['directive prev names what the directive does not list']
  try { topoOrder(listed, new Map(edges)) } catch { return ['directive prev has a cycle'] }
  return []
}

// No dependent goes out without, or before, a package the context says it depends on.
const dependencyErrors = (rawPrev, prev, listed) => {
  if (!prev) return []
  const has = new Set(listed)
  const depsOf = (n) => Array.isArray(rawPrev?.[n]) ? rawPrev[n] : []
  const heldBack = listed.filter(n => (prev[n] || []).some(d => !has.has(d)))
  const dropped = listed.filter(n => (prev[n] || []).some(d => has.has(d) && !depsOf(n).includes(d)))
  return [
    heldBack.length && `directive holds back what ${heldBack.join(', ')} depend on`,
    dropped.length && `directive drops dependencies of ${dropped.join(', ')}`,
  ]
}

const sameNames = (list, sorted) => Array.isArray(list) && JSON.stringify([...list].sort()) === JSON.stringify(sorted)
