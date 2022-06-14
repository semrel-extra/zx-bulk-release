// Semantic tags

import {ctx, semver} from 'zx-extra'
import {Buffer} from 'buffer'

const f0 = {
  parse(tag) {
    if (!tag.endsWith('-f0')) return null

    const pattern = /^(\d{4}\.(?:[1-9]|1[012])\.(?:0[1-9]|[12]\d|30|31))-((?:[a-z0-9-]+\.)?[a-z0-9-]+)\.(v?\d+\.\d+\.\d+.*)-f0$/
    const matched = pattern.exec(tag)
    const [, _date, _name, version] = matched || []
    const date = parseDateTag(_date)
    const name = _name.includes('.') ? `@${_name.replace('.', '/')}` : _name

    if (!semver.valid(version)) return null

    return {date, name, version, format: 'f0'}
  },
  format({name, date = new Date(), version}) {
    if (!/^(@?[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name) || !semver.valid(version)) return null

    const d = formatDateTag(date)
    const n = name.replace('@', '').replace('/', '.')

    return `${d}-${n}.${version}-f0`
  }
}

const f1 = {
  parse(tag) {
    if (!tag.endsWith('-f1')) return null

    const pattern = /^(\d{4}\.(?:[1-9]|1[012])\.(?:0[1-9]|[12]\d|30|31))-[a-z0-9-]+\.(v?\d+\.\d+\.\d+.*)\.([^.]+)-f1$/
    const matched = pattern.exec(tag)
    const [, _date, version, b64] = matched || []
    const date = parseDateTag(_date)
    const name = Buffer.from(b64, 'base64url').toString('utf8')

    if (!semver.valid(version)) return null

    return {date, name, version, format: 'f1'}
  },
  format({name, date = new Date(), version}) {
    if (!semver.valid(version)) return null

    const b64 = Buffer.from(name).toString('base64url')
    const d = formatDateTag(date)
    const n = name.replace(/[^a-z0-9-]/ig, '')

    return `${d}-${n}.${version}.${b64}-f1`
  }
}

// TODO
// const variants = [f0, f1]
// export const parseTag = (tag) => {
//   for (const variant of variants) {
//     const parsed = variant.parse(tag)
//     if (parsed) return parsed
//   }
//
//   return null
// }

export const parseTag = (tag) => f0.parse(tag) || f1.parse(tag) || null

export const formatTag = (tag) => f0.format(tag) || f1.format(tag) || null

export const getTags = (cwd) => ctx(async ($) => {
  $.cwd = cwd

  return (await $`git tag -l --sort=-v:refname`).toString()
    .split('\n')
    .map(tag => parseTag(tag.trim()))
    .filter(Boolean)
})

const formatDateTag = (date) => `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`

const parseDateTag = (date) => new Date(date.replaceAll('.', '-')+'Z')
