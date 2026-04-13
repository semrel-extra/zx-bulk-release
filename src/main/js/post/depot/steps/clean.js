import {api} from '../../api/index.js'

export const clean = async ({cwd, packages}) => {
  await api.git.unsetUserConfig(cwd)
  await Promise.all(Object.values(packages).filter(p => !p.skipped).map(api.npm.npmRestore))
}
