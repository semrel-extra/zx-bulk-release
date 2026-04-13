import tar from 'tar-stream'
import crypto from 'node:crypto'
import {fs, path} from 'zx-extra'
import {pipeline} from 'node:stream/promises'
import {createWriteStream, createReadStream} from 'node:fs'

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
  await pipeline(pack, createWriteStream(tarPath))
  return tarPath
}

export const hashFile = async (filePath) => {
  const hash = crypto.createHash('sha1')
  await pipeline(createReadStream(filePath), hash)
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

export const unpackTar = async (tarPath, destDir) => {
  await fs.ensureDir(destDir)
  const extract = tar.extract()
  let manifest = null

  const done = new Promise((resolve, reject) => {
    extract.on('entry', (header, stream, cb) => {
      const chunks = []
      stream.on('data', d => chunks.push(d))
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
