// Minimal tar pack/unpack for parcel containers.
// Uses tar-stream (already a dependency) in store mode (no compression).

import tar from 'tar-stream'
import {fs, path} from 'zx-extra'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {createWriteStream, createReadStream} from 'node:fs'

// Pack a manifest object and optional files into a .tar file.
// files: [{name, source}] — source is absolute path
// Returns the tar file path.
export const packTar = async (tarPath, manifest, files = []) => {
  const pack = tar.pack()
  const json = JSON.stringify(manifest, null, 2)
  pack.entry({name: 'manifest.json', size: Buffer.byteLength(json)}, json)

  for (const {name, source} of files) {
    const stat = await fs.stat(source)
    if (stat.isDirectory()) {
      await addDir(pack, name, source)
    } else {
      const buf = await fs.readFile(source)
      pack.entry({name, size: buf.length}, buf)
    }
  }

  pack.finalize()
  await pipeline(pack, createWriteStream(tarPath))
  return tarPath
}

// Recursively add a directory to tar pack.
const addDir = async (pack, prefix, dirPath) => {
  const entries = await fs.readdir(dirPath, {withFileTypes: true})
  for (const e of entries) {
    const full = path.join(dirPath, e.name)
    const rel = path.join(prefix, e.name)
    if (e.isDirectory()) {
      await addDir(pack, rel, full)
    } else {
      const buf = await fs.readFile(full)
      pack.entry({name: rel, size: buf.length}, buf)
    }
  }
}

// Unpack a .tar file into a directory.
// Returns {manifest, dir} where manifest is the parsed manifest.json
// and dir is the directory containing extracted files.
export const unpackTar = async (tarPath, destDir) => {
  await fs.ensureDir(destDir)
  const extract = tar.extract()
  let manifest = null

  const done = new Promise((resolve, reject) => {
    extract.on('entry', (header, stream, cb) => {
      const chunks = []
      stream.on('data', (d) => chunks.push(d))
      stream.on('end', async () => {
        const buf = Buffer.concat(chunks)
        if (header.name === 'manifest.json') {
          manifest = JSON.parse(buf.toString('utf8'))
        } else {
          const dest = path.join(destDir, header.name)
          await fs.ensureDir(path.dirname(dest))
          await fs.writeFile(dest, buf)
        }
        cb()
      })
      stream.resume()
    })
    extract.on('finish', resolve)
    extract.on('error', reject)
  })

  await pipeline(createReadStream(tarPath), extract)
  await done

  return {manifest, dir: destDir}
}
