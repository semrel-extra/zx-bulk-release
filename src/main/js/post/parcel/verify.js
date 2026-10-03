import {fs, path} from 'zx-extra'
import {parcelChannel} from './directive.js'
import {sanitizePkgName} from './build.js'
import {mergePopulate} from './populate.js'
import {readManifest} from '../tar.js'

const MARKERS = new Set(['released', 'skip', 'conflict', 'orphan'])

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

const isMarker = async (tarPath) =>
  (await fs.stat(tarPath)).size <= 16 && MARKERS.has(await fs.readFile(tarPath, 'utf8'))

const findPackage = (name, expected) => Object.entries(expected).find(([pkgName, pkg]) =>
  name.includes(`.${sanitizePkgName(pkgName)}.${pkg.version}.`)
)

export const verifyParcels = (tars, context) => {
  const {sha7, packages: expected} = context
  const errors = []
  const verified = []

  for (const tarPath of tars) {
    const name = path.basename(tarPath)

    if (!name.startsWith(`parcel.${sha7}.`)) {
      errors.push(`sha mismatch: ${name}`)
      continue
    }

    const channel = parcelChannel(name)
    if (!channel) {
      errors.push(`malformed name: ${name}`)
      continue
    }

    if (channel === 'directive') {
      verified.push(tarPath)
      continue
    }

    const belongsTo = findPackage(name, expected)
    if (!belongsTo) {
      errors.push(`unexpected parcel (no matching package): ${name}`)
      continue
    }

    const [pkgName, pkg] = belongsTo
    if (!pkg.channels.includes(channel)) {
      errors.push(`unexpected channel '${channel}' for ${pkgName}: ${name}`)
      continue
    }

    verified.push(tarPath)
  }

  return {verified, errors}
}

// Checks that pack kept what the context fixed: the channel, the release tag and the populate
// rules of every manifest, and the commit time the directives are ordered by. No env, no schemas:
// the courier checks the resolved manifests against the rules right before delivery.
export const verifyManifests = async (tars, context) => {
  const errors = []

  for (const tarPath of tars) {
    const name = path.basename(tarPath)
    const channel = parcelChannel(name)
    if (await isMarker(tarPath)) continue

    let raw
    try { raw = await readManifest(tarPath) } catch {
      errors.push(`unreadable manifest: ${name}`)
      continue
    }
    if (raw?.channel !== channel) {
      errors.push(`manifest channel does not match the parcel name: ${name}`)
      continue
    }
    if (own(raw, '__proto__')) {
      errors.push(`manifest has a '__proto__' key: ${name}`)
      continue
    }

    if (channel === 'directive') {
      const fileTs = Number(name.replace(/\.tar$/, '').split('.')[3])
      if (context.timestamp !== undefined && (raw.timestamp !== context.timestamp || fileTs !== context.timestamp))
        errors.push(`directive timestamp differs from the commit time: ${name}`)
      continue
    }

    const [, pkg] = findPackage(name, context.packages)
    if (own(raw, 'tag') && raw.tag !== pkg.tag)
      errors.push(`manifest tag differs from the context: ${name}`)
    if (JSON.stringify(raw.populate || mergePopulate()) !== JSON.stringify(pkg.populate || mergePopulate()))
      errors.push(`populate rules differ from the context: ${name}`)
  }

  return errors
}
