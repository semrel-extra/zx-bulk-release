// Semantic tags processing

import {ctx, semver, $} from 'zx-extra'
import {Buffer} from 'buffer'
import {parseEnv} from './config.js'
import {log} from './log.js'

export const pushTag = (pkg) => ctx(async ($) => {
  const {absPath: cwd, name, version} = pkg
  const tag = formatTag({name, version})
  const {gitCommitterEmail, gitCommitterName} = parseEnv($.env)

  pkg.context.git.tag = tag
  log({pkg})(`push release tag ${tag}`)

  $.cwd = cwd
  await $`git config user.name ${gitCommitterName}`
  await $`git config user.email ${gitCommitterEmail}`
  await $`git tag -m ${tag} ${tag}`
  await $`git push origin ${tag}`
})

const f0 = {
  parse(tag) {
    if (!tag.endsWith('-f0')) return null

    const pattern = /^(\d{4}\.(?:[1-9]|1[012])\.(?:[1-9]|[12]\d|30|31))-((?:[a-z0-9-]+\.)?[a-z0-9-]+)\.(v?\d+\.\d+\.\d+.*)-f0$/
    const matched = pattern.exec(tag) || []
    const [, _date, _name, version] = matched

    if (!semver.valid(version)) return null

    const date = parseDateTag(_date)
    const name = _name.includes('.') ? `@${_name.replace('.', '/')}` : _name

    return {date, name, version, format: 'f0', ref: tag}
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

    const pattern = /^(\d{4}\.(?:[1-9]|1[012])\.(?:[1-9]|[12]\d|30|31))-[a-z0-9-]+\.(v?\d+\.\d+\.\d+.*)\.([^.]+)-f1$/
    const matched = pattern.exec(tag) || []
    const [, _date, version, b64] = matched

    if (!semver.valid(version)) return null

    const date = parseDateTag(_date)
    const name = Buffer.from(b64, 'base64url').toString('utf8')

    return {date, name, version, format: 'f1', ref: tag}
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
  parse(tag) {
    const pattern = /^(@?[a-z0-9-]+(?:\/[a-z0-9-]+)?)@(v?\d+\.\d+\.\d+.*)/
    const [, name, version] = pattern.exec(tag) || []

    if (!semver.valid(version)) return null

    return {name, version, format: 'lerna', ref: tag}
  },
  // format({name, version}) {
  //   if (!semver.valid(version)) return null
  //
  //   return `${name}@${version}`
  // }
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

export const parseTag = (tag) => f0.parse(tag) || f1.parse(tag) || lerna.parse(tag) || null

export const formatTag = (tag) => f0.format(tag) || f1.format(tag) || null

export const getTags = async (cwd, ref = '') =>
  (await $.o({cwd})`git tag -l ${ref}`).toString()
    .split('\n')
    .map(tag => parseTag(tag.trim()))
    .filter(Boolean)
    .sort((a, b) => semver.rcompare(a.version, b.version))

export const getLatestTag = async (cwd, name) =>
  (await getTags(cwd)).find(tag => tag.name === name) || null

export const getLatestTaggedVersion = async (cwd, name) =>
  (await getLatestTag(cwd, name))?.version || null

export const formatDateTag = (date = new Date()) => `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`

export const parseDateTag = (date) => new Date(date.replaceAll('.', '-')+'Z')
