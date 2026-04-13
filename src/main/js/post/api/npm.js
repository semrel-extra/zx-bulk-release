import zlib from 'node:zlib'
import _fs from 'node:fs/promises'
import _path from 'node:path'
import tar from 'tar-stream'
import {Readable} from 'node:stream'
import {$, semver, fs, INI, fetch, tempy} from 'zx-extra'

import {log} from '../log.js'
import {attempt2, memoizeBy} from '../../util.js'

const FETCH_TIMEOUT_MS = 15_000
const NPM_OIDC_VER = '11.5.0'
const NPM_VER = (await $`npm --version`).toString().trim()

// https://stackoverflow.com/questions/19978452/how-to-extract-single-file-from-tar-gz-archive-using-node-js

export const fetchPkg = async (pkg) => {
  const id = `${pkg.name}@${pkg.version}`
  const now = Date.now()

  try {
    const cwd = pkg.absPath
    const {npmRegistry, npmToken, npmConfig} = pkg.config
    const tarballUrl = getTarballUrl(npmRegistry, pkg.name, pkg.version)
    const bearerToken = getBearerToken(npmRegistry, npmToken, npmConfig)
    const headers = bearerToken ? {Authorization: bearerToken} : {}
    log.info(`fetching '${id}' from ${npmRegistry}`)

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
    const tarball = await attempt2(() => fetch(tarballUrl, {
      method: 'GET',
      headers,
      signal: ac.signal,
    }))
    clearTimeout(timer)

    if (!tarball.ok) {
      throw new Error(`registry responded with ${tarball.status} for ${tarballUrl}`)
    }

    await unzip(pipify(tarball.body), {cwd, strip: 1, omit: ['package.json']})

    log.info(`fetch duration '${id}': ${Date.now() - now}`)
    pkg.fetched = true
  } catch (e) {
    log.warn(`fetching '${id}' failed`, e)
  }
}

export const fetchManifest = async (pkg, {nothrow} = {}) => {
  const {npmRegistry, npmToken, npmConfig} = pkg.config
  const bearerToken = getBearerToken(npmRegistry, npmToken, npmConfig)
  const url = getManifestUrl(npmRegistry, pkg.name.replace('/', '%2f'), pkg.version || 'latest')
  const reqOpts = bearerToken ? {headers: {authorization: bearerToken}} : {}

  try {
    const res = await attempt2(() => fetch(url, reqOpts))
    if (!res.ok) throw new Error(`npm registry responded with ${res.status} for ${url}`)

    return res.json() // NOTE .json() is async too
  } catch (e) {
    if (nothrow) return null
    throw e
  }
}

export const npmPersist = async (pkg) => {
  const {name, version, manifest, manifestAbsPath} = pkg
  log.info(`updating ${manifestAbsPath} inners: ${name} ${version}`)
  await fs.writeJson(manifestAbsPath, manifest, {spaces: 2})
}

export const npmRestore = async (pkg) => {
  const {manifestRaw, manifestAbsPath} = pkg
  log.info(`rolling back ${manifestAbsPath} inners to manifestRaw`)
  await fs.writeFile(manifestAbsPath, manifestRaw, {encoding: 'utf8'})
}

export const npmPublish = async (pkg) => {
  const {name, version, manifest, config: {npmPublish, npmRegistry, npmToken, npmConfig, npmProvenance, npmOidc}} = pkg

  if (manifest.private || npmPublish === false) return

  log.info(`publishing npm package ${name} ${version} to ${npmRegistry}`)

  const npmTag = pkg.preversion ? 'snapshot' : 'latest'
  const npmFlags = [
    '--no-workspaces',
    '--no-git-tag-version',
    `--tag=${npmTag}`,
    npmRegistry && `--registry=${npmRegistry}`,
  ]

  // OIDC trusted publishing: no auth token must be present for npm to use OIDC flow.
  // https://docs.npmjs.com/trusted-publishers/
  if (npmOidc) {
    if (!semver.gte(NPM_VER, NPM_OIDC_VER)) {
      throw new Error(`npm OIDC trusted publishing requires npm >= ${NPM_OIDC_VER}, got ${NPM_VER}`)
    }
    log.info('npm publish: OIDC trusted publishing enabled')
    npmFlags.push('--provenance')
  } else {
    const npmrc = await getNpmrc({npmConfig, npmToken, npmRegistry})
    npmFlags.push(`--userconfig=${npmrc}`)
    if (npmProvenance) npmFlags.push('--provenance')
  }

  // Publish from pre-built tarball (courier mode) or project dir (legacy).
  const target = pkg.npmTarball || pkg.absPath
  await $`npm publish ${target} ${npmFlags.filter(Boolean)}`
}

export const getNpmrc = memoizeBy(async ({npmConfig, npmToken, npmRegistry}) => {
  if (npmConfig) return npmConfig

  const npmrc = tempy.temporaryFile({name: '.npmrc'})
  await fs.writeFile(npmrc, `${npmRegistry.replace(/^https?:\/\//, '//')}/:_authToken=${npmToken}`, {encoding: 'utf8'})

  return npmrc
}, ({npmConfig, npmToken, npmRegistry}) => `${npmConfig}:${npmToken}:${npmRegistry}`)

// $`npm view ${name}@${version} dist.tarball`
export const getTarballUrl = (registry, name, version) => `${registry}/${name}/-/${name.replace(/^.+(%2f|\/)/,'')}-${version}.tgz`

export const getManifestUrl = (registry, name, version) => `${registry}/${name}/${version}`

export const getBearerToken = (npmRegistry, npmToken, npmConfig) => {
  const token = npmConfig
    ? getAuthToken(npmRegistry, INI.parse(fs.readFileSync(npmConfig, 'utf8')))
    : npmToken
  return token ? `Bearer ${token}` : null
}

// NOTE registry-auth-token does not work with localhost:4873
export const getAuthToken = (registry, npmrc) =>
  (Object.entries(npmrc).find(([reg]) => reg.startsWith(registry.replace(/^https?/, ''))) || [])[1]

const pipify = (stream) => stream.pipe ? stream : Readable.from(stream)

const safePath = v => _path.resolve('/', v).slice(1)

const unzip = (stream, {pick, omit, cwd = process.cwd(), strip = 0} = {}) => new Promise((resolve, reject) => {
  const extract = tar.extract()
  const results = []

  extract.on('entry', ({name, type}, stream, cb) => {
    const _name = safePath(strip ? name.split('/').slice(strip).join('/') : name)
    const fp = _path.join(cwd, _name)
    const skip = type !== 'file' || omit?.includes(_name) || (pick && !pick.includes(_name))

    const chunks = []
    stream.on('data', (chunk) => {
      if (!skip) chunks.push(chunk)
    })

    stream.on('end', () => {
      if (chunks.length) {
        results.push(
          _fs.mkdir(_path.dirname(fp), {recursive: true})
            .then(() => _fs.writeFile(fp, Buffer.concat(chunks)))
        )
      }
      cb()
    })

    stream.resume()
  })

  extract.on('finish', () => resolve(Promise.all(results)))

  stream
    .pipe(zlib.createGunzip())
    .pipe(extract)
})
