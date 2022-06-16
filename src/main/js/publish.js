import {formatTag} from './tag.js'
import {tempy, ctx} from 'zx-extra'
import {copydir} from 'git-glob-cp'

const branches = {}

const prepare = async ({branch, origin}) => ctx(async ($) => {
  let cwd = branches[branch]?.cwd

  if (cwd) return cwd

  cwd = tempy.temporaryDirectory()
  $.cwd = cwd
  try {
    await $`git clone --single-branch --branch ${branch} --depth 1 ${origin} .`
  } catch {
    await $`git init .`
    await $`git remote add origin ${origin}`
  }

  return cwd
})

export const copy = async ({cwd, from, to, branch = 'meta', origin, msg = 'updated'}) => ctx(async ($) => {
  const _origin = origin || (await $`git remote get-url origin`).toString().trim()
  const _cwd = await prepare({branch, origin: _origin})
  await copydir({baseFrom: cwd, from, baseTo: _cwd, to})

  $.cwd = _cwd

  await $`git add .`
  await $`git commit -m ${msg}`
  await $.raw`git push origin HEAD:refs/heads/${branch}`
})

export const publish = async ({cwd, env, registry = 'http://localhost:4873/', version, name}) => ctx(async ($) => {
  $.cwd = cwd
  $.env = env

  const tag = formatTag({name, version})

  await $`git tag -m ${tag} ${tag}`
  await $`git push origin ${tag}`

  await copy({cwd, from: 'package.json', to: 'package.json', branch: 'meta', msg: `chore: publish artifact ${name} ${version}`})

  await $`npm publish --no-git-tag-version --registry=${registry}`
})
