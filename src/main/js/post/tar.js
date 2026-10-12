import tar from 'tar-stream'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import {pipeline} from 'node:stream/promises'
import {fs, path} from 'zx-extra'

// A handled parcel is replaced by a marker: released, conflict, skip (3.x, held for credentials) or orphan.
const MARKERS = new Set(['released', 'skip', 'conflict', 'orphan'])

export const readMarker = async (tarPath) => {
  if ((await fs.stat(tarPath)).size > 16) return null
  const content = await fs.readFile(tarPath, 'utf8')
  return MARKERS.has(content) ? content : null
}

export const packTar = async (tarPath, manifest, files = []) => {
  await fs.ensureDir(path.dirname(tarPath))
  const pack = tar.pack()
  const json = JSON.stringify(manifest, null, 2)
  pack.entry({name: 'manifest.json', size: Buffer.byteLength(json)}, json)

  for (const {name, source} of files) {
    const stat = await fs.stat(source)
    if (stat.isDirectory()) await addDir(pack, name, source)
    else {
      const buf = await fs.readFile(source)
      pack.entry({name, size: buf.length}, buf)
    }
  }

  pack.finalize()
  await pipeline(pack, fs.createWriteStream(tarPath))
  return tarPath
}

export const hashFile = async (filePath) => {
  const hash = crypto.createHash('sha1')
  await pipeline(fs.createReadStream(filePath), hash)
  return hash.digest('hex').slice(0, 6)
}

const addDir = async (pack, prefix, dirPath) => {
  for (const e of await fs.readdir(dirPath, {withFileTypes: true})) {
    const full = path.join(dirPath, e.name)
    const rel = path.join(prefix, e.name)
    if (e.isDirectory()) await addDir(pack, rel, full)
    else {
      const buf = await fs.readFile(full)
      pack.entry({name: rel, size: buf.length}, buf)
    }
  }
}

// Parcels come from an untrusted phase: only plain files are taken, and only inside destDir.
// A bad entry fails the unpacking, it never escapes as an unhandled rejection.
export const unpackTar = async (tarPath, destDir) => {
  const root = path.resolve(destDir)
  const extract = tar.extract()
  let manifest = null

  const take = async ({name, type}, buf) => {
    if (name === 'manifest.json') {
      manifest = JSON.parse(buf.toString('utf8'))
      return
    }
    const dest = path.resolve(root, name)
    if (type !== 'file' || !dest.startsWith(root + path.sep)) throw new Error(`unsafe entry in ${path.basename(tarPath)}: ${name}`)
    await fs.outputFile(dest, buf)
  }

  extract.on('entry', (header, stream, cb) => {
    const chunks = []
    stream.on('data', d => chunks.push(d))
    stream.on('end', () => take(header, Buffer.concat(chunks)).then(() => cb(), cb))
    stream.resume()
  })

  await fs.ensureDir(root)
  await pipeline(fs.createReadStream(tarPath), extract)
  return {manifest, dir: destDir}
}

// Reads manifest.json only, other entries are skipped without touching the disk.
export const readManifest = async (tarPath) => {
  const extract = tar.extract()
  let raw = null

  extract.on('entry', (header, stream, cb) => {
    const chunks = []
    stream.on('data', d => header.name === 'manifest.json' && chunks.push(d))
    stream.on('end', () => {
      if (header.name === 'manifest.json') raw = Buffer.concat(chunks).toString('utf8')
      cb()
    })
    stream.resume()
  })

  await pipeline(fs.createReadStream(tarPath), extract)
  return raw === null ? null : JSON.parse(raw)
}

// Reads package.json from the npm tarball (package.tgz) inside a parcel — npm publishes
// under the name and version found there. Null if there is no tarball or it is ambiguous.
export const readNpmManifest = async (tarPath) => {
  const outer = tar.extract()
  const found = []

  outer.on('entry', (header, stream, next) => {
    if (header.name !== 'package.tgz') {
      stream.on('end', next)
      return stream.resume()
    }

    const inner = tar.extract()
    inner.on('entry', (h, s, n) => {
      const match = isNpmManifest(h.name)
      const chunks = []
      s.on('data', d => match && chunks.push(d))
      s.on('end', () => {
        if (match) found.push({type: h.type, json: Buffer.concat(chunks).toString('utf8')})
        n()
      })
      s.resume()
    })
    pipeline(stream, zlib.createGunzip(), inner).then(() => next(), next)
  })

  await pipeline(fs.createReadStream(tarPath), outer)
  if (found.length !== 1 || found[0].type !== 'file') return null
  try { return JSON.parse(found[0].json) } catch { return null }
}

// npm drops the first path segment as it is, whatever it is called, then normalizes the rest and takes
// package.json from the top: every entry that lands there counts, so a second spelling can't hide behind the first.
const isNpmManifest = (name) =>
  path.posix.normalize(name.split('/').slice(1).join('/')).replace(/^\/+/, '') === 'package.json'
