import {parseEnv} from './config.js'
import {$, ctx, fs, path, tempy} from 'zx-extra'
import ini from 'ini'
import {copy} from 'git-glob-cp'

export const fetchPkg = async (pkg, {env = $.env} = {}) => {
  try {
    const cwd = pkg.absPath
    const {npmRegistry, npmToken, npmConfig} = parseEnv(env)
    const temp = tempy.temporaryDirectory()
    const bearerToken = getBearerToken(npmRegistry, npmToken, npmConfig)
    const tarball = getTarballUrl(npmRegistry, pkg.name, pkg.version)

    await $.raw`wget --header='Authorization: ${bearerToken}' -qO- ${tarball} | tar xvz -C ${temp}`
    await copy({from: ['**/*', '!package.json'], to: cwd, cwd: `${temp}/package`})

    pkg.fetched = true
    console.log(`[${pkg.name}] fetched '${pkg.name}@${pkg.version}'`)
  } catch (e) {
    console.log(`[${pkg.name}] fetching '${pkg.name}@${pkg.version}' failed`, e)
  }
}

export const fetchManifest = async (pkg, {nothrow, env = $.env} = {}) => {
  const {npmRegistry, npmToken, npmConfig} = parseEnv(env)
  const bearerToken = getBearerToken(npmRegistry, npmToken, npmConfig)
  const url = getManifestUrl(npmRegistry, pkg.name, pkg.version)

  try {
    const res = await fetch(url, {authorization: bearerToken})
    if (!res.ok) throw res

    return res.json() // NOTE .json() is async too
  } catch (e) {
    if (nothrow) return null
    throw e
  }
}

export const npmPublish = (pkg) => ctx(async ($) => {
  const {absPath: cwd, name, version} = pkg
  const {npmRegistry, npmToken, npmConfig} = parseEnv($.env)
  const npmrc = npmConfig ? npmConfig : path.resolve(cwd, '.npmrc')

  console.log(`[${name}] publish npm package ${name} ${version} to ${npmRegistry}`)
  $.cwd = cwd
  if (!npmConfig) {
    await $.raw`echo ${npmRegistry.replace(/https?:/, '')}/:_authToken=${npmToken} >> ${npmrc}`
  }
  await $`npm publish --no-git-tag-version --registry=${npmRegistry} --userconfig ${npmrc} --no-workspaces`
})

// NOTE registry-auth-token does not work with localhost:4873
export const getAuthToken = (registry, npmrc) =>
  (Object.entries(npmrc).find(([reg]) => reg.startsWith(registry.replace(/^https?/, ''))) || [])[1]

// $`npm view ${name}@${version} dist.tarball`
export const getTarballUrl = (registry, name, version) => `${registry}/${name}/-/${name.replace(/^.+(%2f|\/)/,'')}-${version}.tgz`

export const getManifestUrl = (registry, name, version) => `${registry}/${name}/${version}`

export const getBearerToken = async (npmRegistry, npmToken, npmConfig) => {
  const token = npmConfig
    ? getAuthToken(npmRegistry, ini.parse(await fs.readFile(npmConfig, 'utf8')))
    : npmToken
  return `Bearer ${token}`
}
