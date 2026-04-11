// Pure tag parsing/formatting. No IO, no side effects.

import {Buffer} from 'node:buffer'
import {semver} from 'zx-extra'

const isSafeName = n => /^(@?[a-z0-9-]+\/)?[a-z0-9-]+$/.test(n)

const f0 = {
  name: 'f0',
  parse(tag) {
    if (!tag.endsWith('-f0')) return null

    const pattern = /^(\d{4}\.(?:[1-9]|1[012])\.(?:[1-9]|[12]\d|30|31))-((?:[a-z0-9-]+\.)?[a-z0-9-]+)\.(v?\d+\.\d+\.\d+.*)-f0$/
    const matched = pattern.exec(tag) || []
    const [, _date, _name, version] = matched

    if (!semver.valid(version)) return null

    const date = parseDateTag(_date)
    const name = _name.includes('.') ? `@${_name.replace('.', '/')}` : _name

    return {date, name, version, format: this.name, ref: tag}
  },
  format({name, date = new Date(), version}) {
    if (!isSafeName(name) || !semver.valid(version)) return null

    const d = formatDateTag(date)
    const n = name.replace('@', '').replace('/', '.')

    return `${d}-${n}.${version}-f0`
  }
}

const f1 = {
  name: 'f1',
  parse(tag) {
    if (!tag.endsWith('-f1')) return null

    const pattern = /^(\d{4}\.(?:[1-9]|1[012])\.(?:[1-9]|[12]\d|30|31))-[a-z0-9-]+\.(v?\d+\.\d+\.\d+.*)\.([^.]+)-f1$/
    const matched = pattern.exec(tag) || []
    const [, _date, version, b64] = matched

    if (!semver.valid(version)) return null

    const date = parseDateTag(_date)
    const name = Buffer.from(b64, 'base64url').toString('utf8')

    return {date, name, version, format: this.name, ref: tag}
  },
  format({name, date = new Date(), version}) {
    if (!semver.valid(version)) return null

    const b64 = Buffer.from(name).toString('base64url')
    const d = formatDateTag(date)
    const n = name.replace(/[^a-z0-9-]/ig, '')

    return `${d}-${n}.${version}.${b64}-f1`
  }
}

const lerna = {
  name: 'lerna',
  parse(tag) {
    const pattern = /^(@?[a-z0-9-]+(?:\/[a-z0-9-]+)?)@(v?\d+\.\d+\.\d+.*)/
    const [, name, version] = pattern.exec(tag) || []

    if (!semver.valid(version)) return null

    return {name, version, format: this.name, ref: tag}
  },
  format({name, version}) {
    if (!semver.valid(version)) return null

    return `${name}@${version}`
  }
}

const pure = {
  name: 'pure',
  parse(tag) {
    if (tag.endsWith('-f0') || tag.endsWith('-f1')) {
      return null
    }
    const parsed = semver.parse(tag) || {}
    const {prerelease} = parsed
    if (!prerelease?.length) {
      return null
    }

    const [n, o = ''] = prerelease.reverse()
    const name = (!o || o === 'x') ? n : `@${o}/${n}`
    const version = tag.slice(0, -1 - n.length - (o ? o.length + 1 : 0))

    return {format: this.name, ref: tag, name, version}
  },
  format({name, version}) {
    const parsed = semver.parse(version)
    if (!parsed || !isSafeName(name)) {
      return null
    }
    const {prerelease} = parsed
    const [n, o] = name.slice(name[0] === '@' ? 1 : 0).split('/').reverse()
    const extra = prerelease.length
      ? '.' + [o || 'x', n].join('.')
      : '-' + [o, n].filter(Boolean).join('.')
    return version + extra
  }
}

const getFormatter = (tagFormat) => {
  if (!tagFormat) {
    return {
      parse() {},
      format() {}
    }
  }
  const formatter = [f0, f1, pure, lerna].find(f => f.name === tagFormat)
  if (!formatter) {
    throw new Error(`Unsupported tag format: ${tagFormat}`)
  }

  return formatter
}

export const parseTag = (tag) => f0.parse(tag) || f1.parse(tag) || lerna.parse(tag) || pure.parse(tag) || null

export const formatTag = (tag, tagFormat = tag.format) => getFormatter(tagFormat).format(tag) || f0.format(tag) || f1.format(tag) || null

export const formatDateTag = (date = new Date()) => `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`

export const parseDateTag = (date) => new Date(date.replaceAll('.', '-') + 'Z')
