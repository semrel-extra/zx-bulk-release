import {unsetUserConfig} from '../api/git.js'
import {npmRestore} from '../api/npm.js'

export const clean = async (cwd, packages) => {
  await unsetUserConfig(cwd)
  await Promise.all(Object.values(packages).filter(pkg => !pkg.skipped).map(npmRestore))
}
