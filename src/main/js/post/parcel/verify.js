import {path} from 'zx-extra'
import {parcelChannel} from './directive.js'
import {sanitizePkgName} from './build.js'
import {mergePopulate} from './populate.js'
import {readManifest, readNpmManifest, readMarker} from '../tar.js'

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

// parcel.{sha7}.{channel}.{name}.{version}.{hash}.tar — read by position; names are encoded injectively.
const findPackage = (name, sha7, channel, expected) => Object.entries(expected).find(([pkgName, pkg]) => {
  const prefix = `parcel.${sha7}.${channel}.${sanitizePkgName(pkgName)}.${pkg.version}.`
  return name.startsWith(prefix) && /^[0-9a-f]+\.tar$/.test(name.slice(prefix.length))
})

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

    const belongsTo = findPackage(name, sha7, channel, expected)
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

// Checks that pack kept what the context fixed: the channel, package, version, release tag and
// populate rules of every manifest (and of the npm tarball), and the commit time the directives
// are ordered by. No env, no schemas: the courier checks the resolved manifests right before delivery.
export const verifyManifests = async (tars, context) => {
  const errors = []

  for (const tarPath of tars) {
    const name = path.basename(tarPath)
    const channel = parcelChannel(name)
    if (await readMarker(tarPath)) continue

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

    const [pkgName, pkg] = findPackage(name, context.sha7, channel, context.packages)
    if (raw.name !== pkgName || raw.version !== pkg.version)
      errors.push(`manifest name or version differs from the parcel name: ${name}`)
    if (own(raw, 'tag') && raw.tag !== pkg.tag)
      errors.push(`manifest tag differs from the context: ${name}`)
    if (JSON.stringify(raw.populate || mergePopulate()) !== JSON.stringify(pkg.populate || mergePopulate()))
      errors.push(`populate rules differ from the context: ${name}`)

    // npm publishes the tarball under the name and version from its own package.json
    if (channel === 'npm') {
      const tarball = await readNpmManifest(tarPath).catch(() => null)
      if (!tarball)
        errors.push(`npm parcel has no readable package.tgz: ${name}`)
      else if (tarball.name !== pkgName || tarball.version !== pkg.version)
        errors.push(`npm tarball ${JSON.stringify(`${tarball.name}@${tarball.version}`)} differs from the parcel name: ${name}`)
    }
  }

  return errors
}
