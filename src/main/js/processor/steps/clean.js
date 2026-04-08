import {unsetUserConfig} from '../api/git.js'
import {npmRestore} from '../api/npm.js'

export const clean = async (pkg, ctx) => {
  const {cwd, packages} = ctx
  await unsetUserConfig(cwd)
  await Promise.all(Object.values(packages).filter(p => !p.skipped).map(npmRestore))
}
