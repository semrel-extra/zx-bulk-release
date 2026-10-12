import {fs, path, glob} from 'zx-extra'
import {packTar, readManifest, readMarker} from '../tar.js'
import {log} from '../log.js'
import {stepsOf} from '../courier/channels/index.js'

// parcel.{sha7}.{channel}.{...}.tar — channel is the 3rd dot-segment
export const parcelChannel = (name) => name.replace(/\.tar$/, '').split('.')[2]

export const buildDirective = async (ctx, packedPkgs, outputDir) => {
  const {sha, timestamp} = packedPkgs[0].ctx.git
  const packages = {}
  const parcels = []
  const packedNames = new Set(packedPkgs.map(p => p.name))

  for (const pkg of packedPkgs) {
    const pkgParcels = (pkg.tars || []).map(t => path.basename(t))
    packages[pkg.name] = {
      version:  pkg.version,
      tag:      pkg.tag,
      deliver:  stepsOf(pkg.activeTransport || []), // read by 3.x couriers only: order is courier policy now
      parcels:  pkgParcels,
    }
    parcels.push(...pkgParcels)
  }

  // Store dependency graph for parallel delivery in topo order
  const prev = {}
  if (ctx.prev) {
    for (const name of packedNames) {
      const deps = (ctx.prev.get(name) || []).filter(d => packedNames.has(d))
      if (deps.length) prev[name] = deps
    }
  }

  const sha7 = sha.slice(0, 7)
  const manifest = {
    channel: 'directive',
    sha, timestamp: Number(timestamp),
    queue: packedPkgs.map(p => p.name),
    packages, parcels, prev,
  }

  const tarPath = path.join(outputDir, `parcel.${sha7}.directive.${timestamp}.tar`)
  await packTar(tarPath, manifest, [])
  return tarPath
}

export const parseDirective = async (tarPath) => {
  if (await readMarker(tarPath)) return null
  const manifest = await readManifest(tarPath)
  return manifest?.channel === 'directive' ? manifest : null
}

export const scanDirectives = async (dir) => {
  const tars = await glob(path.join(dir, 'parcel.*.directive.*.tar'))
  const result = []

  for (const tarPath of tars) {
    const d = await parseDirective(tarPath)
    if (d) result.push({...d, tarPath})
  }

  return result.sort((a, b) => a.timestamp - b.timestamp)
}

export const invalidateOrphans = async (dir, directive) => {
  const sha7 = directive.sha.slice(0, 7)
  const owned = new Set(directive.parcels || [])
  const all = await glob(path.join(dir, `parcel.${sha7}.*.tar`))
  let count = 0

  for (const tarPath of all) {
    const name = path.basename(tarPath)
    if (parcelChannel(name) === 'directive') continue
    if (owned.has(name)) continue
    await fs.writeFile(tarPath, 'orphan')
    count++
  }

  if (count) log.info(`invalidated ${count} orphan parcel(s) for ${sha7}`)
}
