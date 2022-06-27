import {tempy, fs, $} from 'zx-extra'
import {copy} from 'git-glob-cp'
import ini from 'ini'
import {traverseDeps} from './deps.js'
import {parseEnv} from './publish.js'

export const build = async (pkg, packages) => {
  if (pkg.built) return true

  await traverseDeps(pkg, packages, async (_, {pkg}) => build(pkg, packages))

  const {config} = pkg

  if (pkg.changes.length === 0 && config.npmFetch) await fetchPkg(pkg)

  if (!pkg.fetched && config.cmd) {
    console.log(`[${pkg.name}] run cmd '${config.cmd}'`)
    await $.o({cwd: pkg.absPath, quote: v => v})`${config.cmd}`
  }

  pkg.built = true
  return true
}

const fetchPkg = async (pkg) => {
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
    console.log(`[${pkg.name}] fetched '${pkg.name}@${pkg.version}'`)
  } catch (e) {
    console.log(`[${pkg.name}] fetching '${pkg.name}@${pkg.version}' failed`, e)
  }
}

// NOTE registry-auth-token does not work with localhost:4873
const getAuthToken = (registry, npmrc) =>
  (Object.entries(npmrc).find(([reg]) => reg.startsWith(registry.replace(/^https?/, ''))) || [])[1]

// $`npm view ${name}@${version} dist.tarball`
const getTarballUrl = (registry, name, version) => `${registry}/${name}/-/${name.replace(/^.+(%2f|\/)/,'')}-${version}.tgz`
