import {log} from '../../log.js'
import {$, fs, INI, fetch, tempy} from 'zx-extra'
import {attempt2, pipify, unzip} from '../../util.js'

const FETCH_TIMEOUT_MS = 15_000

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
    log({pkg})(`fetching '${id}' from ${npmRegistry}`)

    // https://stackoverflow.com/questions/46946380/fetch-api-request-timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const tarball = await attempt2(() => fetch(tarballUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    }))
    clearTimeout(timeoutId)

    if (!tarball.ok) {
      throw new Error(`registry responded with ${tarball.status} for ${tarballUrl}`)
    }

    await unzip(pipify(tarball.body), {cwd, strip: 1, omit: ['package.json']})

    log({pkg})(`fetch duration '${id}': ${Date.now() - now}`)
    pkg.fetched = true
  } catch (e) {
    log({pkg, level: 'warn'})(`fetching '${id}' failed`, e)
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
  log({pkg})(`updating ${manifestAbsPath} inners: ${name} ${version}`)
  await fs.writeJson(manifestAbsPath, manifest, {spaces: 2})
}

export const npmRestore = async (pkg) => {
  const {manifestRaw, manifestAbsPath} = pkg
  log({pkg})(`rolling back ${manifestAbsPath} inners to manifestRaw`)
  await fs.writeFile(manifestAbsPath, manifestRaw, {encoding: 'utf8'})
}

export const npmPublish = async (pkg) => {
  const {absPath: cwd, name, version, manifest, config: {npmPublish, npmRegistry, npmToken, npmConfig, npmProvenance, npmOidc}} = pkg

  if (manifest.private || npmPublish === false) return

  log({pkg})(`publishing npm package ${name} ${version} to ${npmRegistry}`)

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
    const npmVersion = (await $`npm --version`).toString().trim()
    const [major, minor] = npmVersion.split('.').map(Number)
    if (major < 11 || (major === 11 && minor < 5)) {
      throw new Error(`npm OIDC trusted publishing requires npm >= 11.5.0, got ${npmVersion}`)
    }
    log({pkg})('npm publish: OIDC trusted publishing enabled')
    npmFlags.push('--provenance')
  } else {
    const npmrc = await getNpmrc({npmConfig, npmToken, npmRegistry})
    npmFlags.push(`--userconfig=${npmrc}`)
    if (npmProvenance) npmFlags.push('--provenance')
  }

  await $({cwd})`npm publish ${npmFlags.filter(Boolean)}`
}

export const getNpmrc = async ({npmConfig, npmToken, npmRegistry}) => {
  if (npmConfig) {
    return npmConfig
  }

  const npmrc =  tempy.temporaryFile({name: '.npmrc'})
  await fs.writeFile(npmrc, `${npmRegistry.replace(/^https?:\/\//, '//')}/:_authToken=${npmToken}`, {encoding: 'utf8'})

  return npmrc
}

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
