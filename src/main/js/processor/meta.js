// Semantic tags processing

import {Buffer} from 'node:buffer'
import {queuefy} from 'queuefy'
import {semver, $, fs, path} from 'zx-extra'
import {log} from '../log.js'
import {fetchRepo, pushCommit, getTags as getGitTags, pushTag, getRepo} from '../api/git.js'
import {fetchManifest} from '../api/npm.js'
import {ghGetAsset} from '../api/gh.js'

export const pushReleaseTag = async (pkg) => {
  const {name, version, tag = formatTag({name, version}), config: {gitCommitterEmail, gitCommitterName}} = pkg
  const cwd = pkg.context.git.root

  pkg.context.git.tag = tag
  log({pkg})(`push release tag ${tag}`)

  await pushTag({cwd, tag, gitCommitterEmail, gitCommitterName})
}

export const prepareMeta = async (pkg) => {
  const {absPath: cwd} = pkg
  const hash = (await $.o({cwd})`git rev-parse HEAD`).toString().trim()
  pkg.meta = {
    META_VERSION: '1',
    hash,
    name: pkg.name,
    version: pkg.version,
    dependencies: pkg.dependencies,
    devDependencies: pkg.devDependencies,
    peerDependencies: pkg.peerDependencies,
    optionalDependencies: pkg.optionalDependencies,
  }
}

export const pushMeta = queuefy(async (pkg) => {
  const {type} = pkg.config.meta

  if (type === null) {
    return
  }

  if (!pkg.meta) {
    await prepareMeta(pkg)
  }

  if (type === 'asset' || type === 'assets') {
    pkg.config.ghAssets = [...pkg.config.ghAssets || [], {
      name: 'meta.json',
      contents: JSON.stringify(pkg.meta, null, 2)
    }]
    return
  }

  log({pkg})('push artifact to branch \'meta\'')

  const {name, version, meta, tag = formatTag({name, version}), absPath: cwd, config: {gitCommitterEmail, gitCommitterName, ghBasicAuth: basicAuth}} = pkg
  const to = '.'
  const branch = 'meta'
  const msg = `chore: release meta ${name} ${version}`
  const files = [{relpath: `${getArtifactPath(tag)}.json`, contents: meta}]

  await pushCommit({cwd, to, branch, msg, files, gitCommitterEmail, gitCommitterName, basicAuth})
})

export const getLatest = async (pkg) => {
  const {absPath: cwd, name } = pkg
  const tag = await getLatestTag(cwd, name)
  const meta = await getLatestMeta(pkg, tag)

  return {
    tag,
    meta
  }
}

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

export const getTags = async (cwd, ref = '') =>
  (await getGitTags(cwd, ref))
    .map(tag => parseTag(tag.trim()))
    .filter(Boolean)
    .sort((a, b) => semver.rcompare(a.version, b.version))

export const getLatestTag = async (cwd, name) =>
  (await getTags(cwd)).find(tag => tag.name === name)

export const getLatestTaggedVersion = async (cwd, name) =>
  (await getLatestTag(cwd, name))?.version || undefined

export const formatDateTag = (date = new Date()) => `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`

export const parseDateTag = (date) => new Date(date.replaceAll('.', '-')+'Z')

export const getArtifactPath = (tag) => tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')

export const getLatestMeta = async (pkg, tag) => {
  if (!tag) return

  const {absPath: cwd, config: {ghBasicAuth: basicAuth}} = pkg
  const {repoName} = await getRepo(cwd, {basicAuth})

  try {
    return JSON.parse(await ghGetAsset({repoName, tag, name: 'meta.json'}))
  } catch {}

  try {
    const _cwd = await fetchRepo({cwd, branch: 'meta', basicAuth})
    return await Promise.any([
      fs.readJson(path.resolve(_cwd, `${getArtifactPath(tag)}.json`)),
      fs.readJson(path.resolve(_cwd, getArtifactPath(tag), 'meta.json'))
    ])
  } catch {}

  return fetchManifest(pkg, {nothrow: true})
}
