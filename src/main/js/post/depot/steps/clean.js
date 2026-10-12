import {api} from '../../api/index.js'

export const clean = async ({packages}) => {
  await Promise.all(Object.values(packages).filter(p => !p.skipped).map(api.npm.npmRestore))
}
