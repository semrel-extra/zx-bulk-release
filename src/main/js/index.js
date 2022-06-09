import {$, fs, path} from 'zx'

import {topo as _topo} from '@semrel-extra/topo'

export const run = async (env = process.env) => {
  await $`echo "hello"`
}

export const topo = async ({cwd = process.cwd()} = {}) => {
  const workspaces = (await fs.readJson(path.resolve(cwd, 'package.json'))).workspaces
  return _topo({
    cwd,
    workspaces
  })
}
