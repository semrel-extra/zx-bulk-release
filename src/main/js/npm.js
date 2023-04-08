import {log} from './log.js'
import {$, fs, INI, fetch, tempy} from 'zx-extra'

export const fetchPkg = async (pkg) => {
  const id = `${pkg.name}@${pkg.version}`

  try {
    log({pkg})(`fetching '${id}'`)
    const cwd = pkg.absPath
    const {npmRegistry, npmToken, npmConfig} = pkg.config
    const bearerToken = getBearerToken(npmRegistry, npmToken, npmConfig)
    const tarballUrl = getTarballUrl(npmRegistry, pkg.name, pkg.version)
    await $.raw`wget --timeout=10 --header='Authorization: ${bearerToken}' -qO- ${tarballUrl} | tar -xvz --strip-components=1 --exclude='package.json' -C ${cwd}`

    pkg.fetched = true
  } catch (e) {
    log({pkg, level: 'warn'})(`fetching '${id}' failed`, e)
  }
}

export const fetchManifest = async (pkg, {nothrow} = {}) => {
  const {npmRegistry, npmToken, npmConfig} = pkg.config
  const bearerToken = getBearerToken(npmRegistry, npmToken, npmConfig)
  const url = getManifestUrl(npmRegistry, pkg.name, pkg.version)

  try {
    const res = await fetch(url, {headers: {authorization: bearerToken}})
    if (!res.ok) throw res

    return res.json() // NOTE .json() is async too
  } catch (e) {
    if (nothrow) return null
    throw e
  }
}

export const npmPublish = async (pkg) => {
  const {absPath: cwd, name, version, manifest, manifestPath, manifestRaw, config: {npmPublish, npmRegistry, npmToken, npmConfig} } = pkg

  if (manifest.private || npmPublish === false) return

  log({pkg})(`publishing npm package ${name} ${version} to ${npmRegistry}`)

  await fs.writeJson(manifestPath, manifest, {spaces: 2})

  const npmTag = pkg.preversion ? 'snapshot' : 'latest'
  const npmrc = await getNpmrc({npmConfig, npmToken, npmRegistry})

  await $.o({cwd})`npm publish --no-git-tag-version --registry=${npmRegistry} --userconfig ${npmrc} --tag ${npmTag} --no-workspaces`
  await fs.writeFile(manifestPath, manifestRaw, {encoding: 'utf8'})
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
  return `Bearer ${token}`
}

// NOTE registry-auth-token does not work with localhost:4873
export const getAuthToken = (registry, npmrc) =>
  (Object.entries(npmrc).find(([reg]) => reg.startsWith(registry.replace(/^https?/, ''))) || [])[1]
