import {$, tempy, ctx, path, fs} from 'zx-extra'

const branches = {}

const prepare = async ({branch, origin}) => ctx(async ($) => {
  let cwd = branches[branch]?.cwd

  if (cwd) return cwd

  cwd = tempy.temporaryDirectory()
  $.cwd = cwd
  try {
    await $`git clone --single-branch --branch ${branch} --depth 1 ${origin} .`
  } catch {
    await $`git init -b ${branch} .`
    await $`git remote add origin ${origin}`
  }

  return cwd
})

export const copy = async ({cwd, from, to, branch = 'meta', origin, msg = 'updated'}) => ctx(async ($) => {
  $.cwd = cwd

  const _origin = origin || (await $`git remote get-url origin`).toString().trim()
  const _cwd = await prepare({branch, origin: _origin})
  await fs.copy(path.resolve(cwd, from), path.resolve(_cwd, to), {overwrite: true})

  await $`git add .`
  await $`git commit -m ${msg}`
  await $.raw`git push origin HEAD:origin/${branch}`

})
