import {path} from 'zx-extra'
import {parcelChannel} from './directive.js'
import {findPackage} from './build.js'
import {mergePopulate} from './populate.js'
import {directiveErrors, leftoverErrors} from './verify-directive.js'
import {readManifest, readNpmManifest, readMarker} from '../tar.js'

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)


// Names come from an untrusted dir and end up in logs: only the characters pack itself writes.
const SAFE_NAME = /^[\w.@+-]+$/

export const verifyParcels = (tars, context) => {
  const errors = []
  const verified = []
  for (const tarPath of tars) {
    const error = nameError(path.basename(tarPath), context)
    if (error) errors.push(error)
    else verified.push(tarPath)
  }
  errors.push(...directiveNameErrors(verified.map(t => path.basename(t)), context))
  return {verified, errors}
}

const nameError = (name, {sha7, packages}) => {
  const channel = parcelChannel(name)
  const [pkgName, pkg] = findPackage(name, sha7, channel, packages) || []
  const checks = [
    [!SAFE_NAME.test(name), `malformed name: ${JSON.stringify(name)}`],
    [!name.startsWith(`parcel.${sha7}.`), `sha mismatch: ${name}`],
    [!channel, `malformed name: ${name}`],
    [channel !== 'directive' && !pkg, `unexpected parcel (no matching package): ${name}`],
    [pkg && !pkg.channels.includes(channel), `unexpected channel '${channel}' for ${pkgName}: ${name}`],
  ]
  return checks.find(([failed]) => failed)?.[1]
}

// The directive decides what goes out, so there is one, named for the commit time: a second would go out too.
const directiveNameErrors = (names, {sha7, timestamp}) => {
  const directives = names.filter(n => parcelChannel(n) === 'directive')
  if (!names.length) return []
  if (directives.length !== 1) return [`expected one directive among the parcels, found ${directives.length}`]
  if (timestamp !== undefined && directives[0] !== `parcel.${sha7}.directive.${timestamp}.tar`)
    return [`directive is not named for the commit time: ${directives[0]}`]
  return []
}

// Checks that pack kept what the context fixed: the channel, package, version, release tag, commit, npm dist-tag
// and populate rules of every manifest (and of the npm tarball), and what the directive lists.
// No env, no schemas: the courier checks the resolved manifests right before delivery.
// A marker is what is left of a delivered parcel: it has nothing to check but its place, and the courier asks
// the remote about the claims markers stand for.
export const verifyManifests = async (tars, context) => {
  const marked = new Map()
  for (const tarPath of tars) {
    const marker = await readMarker(tarPath)
    if (marker) marked.set(path.basename(tarPath), marker)
  }
  const seen = {names: new Set(tars.map(t => path.basename(t))), marked}
  const errors = leftoverErrors(seen)
  for (const tarPath of tars) if (!marked.has(path.basename(tarPath))) errors.push(...await manifestErrors(tarPath, context, seen))
  return errors
}

const manifestErrors = async (tarPath, context, seen) => {
  const name = path.basename(tarPath)
  const {raw, flaw} = await openManifest(tarPath)
  if (flaw) return [`${flaw}: ${name}`]
  if (raw.channel !== parcelChannel(name)) return [`manifest channel does not match the parcel name: ${name}`]
  const errors = raw.channel === 'directive' ? directiveErrors(raw, context, seen) : await parcelErrors(raw, tarPath, name, context)
  return errors.map(e => `${e}: ${name}`)
}

const openManifest = async (tarPath) => {
  const raw = await readManifest(tarPath).catch(() => null)
  if (!raw || typeof raw !== 'object') return {flaw: 'unreadable manifest'}
  if (own(raw, '__proto__')) return {flaw: `manifest has a '__proto__' key`}
  return {raw}
}

const parcelErrors = async (raw, tarPath, name, {sha, sha7, packages, snapshot}) => {
  const [pkgName, pkg] = findPackage(name, sha7, raw.channel, packages)
  return [
    (raw.name !== pkgName || raw.version !== pkg.version) && 'manifest name or version differs from the parcel name',
    own(raw, 'tag') && raw.tag !== pkg.tag && 'manifest tag differs from the context',
    own(raw, 'sha') && raw.sha !== sha && 'manifest sha differs from the context',
    populateOf(raw) !== populateOf(pkg) && 'populate rules differ from the context',
    raw.channel === 'npm' && await npmFlaw(raw, tarPath, pkgName, pkg, snapshot),
  ].filter(Boolean)
}

const populateOf = ({populate}) => JSON.stringify(populate || mergePopulate())

// npm publishes the tarball under the name and version from its own package.json, and as `snapshot` only
// when the manifest has a preversion.
const npmFlaw = async (raw, tarPath, pkgName, pkg, snapshot) => {
  if (snapshot !== undefined && Boolean(raw.preversion) !== snapshot) return 'npm dist-tag differs from the context'
  const tarball = await readNpmManifest(tarPath).catch(() => null)
  if (!tarball) return 'npm parcel has no readable, unambiguous package.tgz'
  if (tarball.name !== pkgName || tarball.version !== pkg.version)
    return `npm tarball ${JSON.stringify(`${tarball.name}@${tarball.version}`)} differs from the parcel name`
  return null
}
