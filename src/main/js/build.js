import {$} from 'zx-extra'
import {traverseDeps} from './deps.js'
import {fetchPkg} from './npm.js'

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
