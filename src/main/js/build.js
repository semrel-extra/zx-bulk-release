import {ctx} from 'zx-extra'
import {traverseDeps} from './deps.js'

export const build = (pkg, packages) => ctx(async ($) => {
  if (pkg.built) return true

  await traverseDeps(pkg, packages, async (_, {pkg}) => build(pkg, packages))

  if (pkg.manifest.scripts?.build && pkg.manifest?.release?.build) {
    $.cwd = pkg.absPath
    await $`npm run build`
    console.log(`built '${pkg.name}'`)
  }

  pkg.built = true

  return true
})
