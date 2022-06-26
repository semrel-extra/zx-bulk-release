import {ctx, tempy, fs} from 'zx-extra'
import {copy} from 'git-glob-cp'
import ini from 'ini'
import {traverseDeps} from './deps.js'
import {parseEnv} from './publish.js'

export const build = (pkg, packages) => ctx(async ($) => {
  if (pkg.built) return true

  await traverseDeps(pkg, packages, async (_, {pkg}) => build(pkg, packages))

  if (pkg.manifest.scripts?.build && pkg.manifest?.release?.build) {
    if (pkg.changes?.length === 0 && pkg.manifest?.release?.fetch) await fetchPkg(pkg)

    if (!pkg.fetched) {
      $.cwd = pkg.absPath

      await $`yarn build`
      console.log(`built '${pkg.name}'`)

      if (pkg.manifest.scripts?.test && pkg.manifest?.release?.test) {
        await $`yarn test`
        console.log(`tested '${pkg.name}'`)
      }
    }
    await $`yarn install`
  }

  pkg.built = true

  return true
})

const fetchPkg = (pkg) => ctx(async ($) => {
  try {
    const cwd = pkg.absPath
    const {npmRegistry, npmToken, npmConfig} = parseEnv($.env)
    const temp = tempy.temporaryDirectory()
    const token = npmConfig
      ? getAuthToken(npmRegistry, ini.parse(await fs.readFile(npmConfig, 'utf8')))
      : npmToken
    const auth = `Authorization: Bearer ${token}`
    const tarball = getTarballUrl(npmRegistry, pkg.name, pkg.version)

    await $`wget --header=${auth} -qO- ${tarball} | tar xvz -C ${temp}`
    await copy({from: ['**/*', '!package.json'], to: cwd, cwd: `${temp}/package`})

    pkg.fetched = true
    console.log(`fetched '${pkg.name}@${pkg.version}'`)
  } catch (e) {
    console.log(`fetching '${pkg.name}@${pkg.version}' failed`, e)
  }
})

// NOTE registry-auth-token does not work with localhost:4873
const getAuthToken = (registry, npmrc) =>
  (Object.entries(npmrc).find(([reg]) => reg.startsWith(registry.replace(/^https?/, ''))) || [])[1]

// $`npm view ${name}@${version} dist.tarball`
const getTarballUrl = (registry, name, version) => `${registry}/${name}/-/${name.replace(/^.+(%2f|\/)/,'')}-${version}.tgz`
