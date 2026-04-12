import {fs, path, glob} from 'zx-extra'
import {packTar, unpackTar} from '../tar.js'
import {log} from '../log.js'

const GIT_CHANNELS = new Set(['git-tag', 'gh-release', 'changelog', 'gh-pages', 'meta'])

const splitSteps = (channelNames) => {
  const git = channelNames.filter(n => GIT_CHANNELS.has(n))
  const ext = channelNames.filter(n => !GIT_CHANNELS.has(n))
  return [git, ext].filter(s => s.length)
}

export const buildDirective = async (ctx, packedPkgs, outputDir) => {
  const {sha, timestamp} = packedPkgs[0].ctx.git
  const packages = {}
  const parcels = []

  for (const pkg of packedPkgs) {
    const pkgParcels = (pkg.tars || []).map(t => path.basename(t))
    packages[pkg.name] = {
      version:  pkg.version,
      tag:      pkg.tag,
      deliver:  splitSteps(pkg.activeTransport || []),
      parcels:  pkgParcels,
    }
    parcels.push(...pkgParcels)
  }

  const sha7 = sha.slice(0, 7)
  const manifest = {
    channel: 'directive',
    sha, timestamp: Number(timestamp),
    queue: packedPkgs.map(p => p.name),
    packages, parcels,
  }

  const tarPath = path.join(outputDir, `parcel.${sha7}.directive.${timestamp}.tar`)
  await packTar(tarPath, manifest, [])
  return tarPath
}

export const parseDirective = async (tarPath) => {
  const content = await fs.readFile(tarPath, 'utf8').catch(() => null)
  if (content === 'released' || content === 'conflict') return null

  const {manifest} = await unpackTar(tarPath, tarPath + '.d')
  if (manifest.channel !== 'directive') return null
  return manifest
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
    if (name.includes('.directive.')) continue
    if (owned.has(name)) continue
    await fs.writeFile(tarPath, 'orphan')
    count++
  }

  if (count) log.info(`invalidated ${count} orphan parcel(s) for ${sha7}`)
}
