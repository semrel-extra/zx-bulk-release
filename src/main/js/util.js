import zlib from 'node:zlib'
import fs from 'node:fs/promises'
import path from 'node:path'
import tar from 'tar-stream'

export const tpl = (str, context) =>
  str?.replace(/\$\{\{\s*([.a-z0-9]+)\s*}}/gi, (matched, key) => get(context, key) ?? '')

export const get = (obj, path = '.') => {
    const chunks = path.split('.').filter(Boolean)
    let result = obj

    for (let i = 0, len = chunks.length; i < len && result !== undefined && result !== null; i++) {
        result = result[chunks[i]]
    }

    return result
}

export const set = (obj, path, value) => {
    const chunks = path.split('.').filter(Boolean)
    let result = obj

    for (let i = 0, len = chunks.length; i < len && result !== undefined && result !== null; i++) {
        if (i === len - 1) {
            result[chunks[i]] = value
        } else {
            result[chunks[i]] = result[chunks[i]] || {}
            result = result[chunks[i]]
        }
    }

    return result
}

export const msgJoin = (rest, context, def) => tpl(rest.filter(Boolean).join(' ') || def, context)

export const keyByValue = (obj, value) => Object.keys(obj).find((key) => obj[key] === value)

export const memoizeBy = (fn, getKey = v => v, memo = new Map()) => async (...args) => {
  const key = await getKey(...args)
  if (memo.has(key)) {
    return memo.get(key)
  }

  const value = fn(...args)
  memo.set(key, value)
  return value
}

export const camelize = s => s.replace(/-./g, x => x[1].toUpperCase())

export const asArray = v => Array.isArray(v) ? v : [v]

export const getCommonPath = files => {
  const f0 = files[0]
  const common = files.length === 1
    ? f0.lastIndexOf('/') + 1
    : [...(f0)].findIndex((c, i) => files.some(f => f.charAt(i) !== c))

  const p = f0.slice(0, common)
  if (p.endsWith('/')) {
    return p
  }

  return p.slice(0, p.lastIndexOf('/') + 1)
}

export const safePath = v => path.resolve('/', v).slice(1)

// https://stackoverflow.com/questions/19978452/how-to-extract-single-file-from-tar-gz-archive-using-node-js
export const unzip = (stream, {pick, omit, cwd = process.cwd(), strip = 0} = {}) => new Promise((resolve, reject) => {
  const extract = tar.extract()
  const results = []

  extract.on('entry', ({name, type}, stream, cb)=>  {
    const _name = safePath(strip ? name.split('/').slice(strip).join('/') : name)
    const fp = path.join(cwd, _name)

    let data = ''
    stream.on('data', (chunk) => {
      if (type !== 'file') {
        return
      }
      if (omit?.includes(_name)) {
        return
      }
      if (pick && !pick.includes(_name)) {
        return
      }

      data +=chunk
    })

    stream.on('end', () => {
      if (data) {
        results.push(
          fs.mkdir(path.dirname(fp), {recursive: true})
            .then(() => fs.writeFile(fp, data, 'utf8'))
        )
      }
      cb()
    })

    stream.resume()
  })

  extract.on('finish', ()=> {
    resolve(Promise.all(results))
  })

  // fs.createReadStream('archive.tar.gz')
  stream
    .pipe(zlib.createGunzip())
    .pipe(extract)
})
