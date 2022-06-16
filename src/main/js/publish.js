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

export const push = async ({cwd, from, to, branch, origin, msg, ignoreFiles}) => ctx(async ($) => {
  const _origin = origin || (await $`git remote get-url origin`).toString().trim()
  const _cwd = await prepare({branch, origin: _origin})
  await copydir({baseFrom: cwd, from, baseTo: _cwd, to})

  $.cwd = _cwd

  await $`git add .`
  await $`git commit -m ${msg}`
  await $.raw`git push origin HEAD:refs/heads/${branch}`
})

export const publish = async (pkg, env, registry = 'http://localhost:4873/') => ctx(async ($) => {
  const {name, version, files} = pkg.manifest
  const cwd = pkg.absPath
  $.cwd = cwd
  $.env = env

  const tag = formatTag({name, version})
  const from = files ? [...files, 'package.json'] : ['!node_modules', '*']
  const to = tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  console.log(`push release tag ${tag}`)
  await $`git tag -m ${tag} ${tag}`
  await $`git push origin ${tag}`

  console.log('push artifact to branch `meta`')
  await push({cwd, from, to, branch: 'meta', msg: `chore: publish artifact ${name} ${version}`, ignoreFiles: '.npmignore'})

  console.log(`publish npm package to ${registry}`)
  await $`npm publish --no-git-tag-version --registry=${registry}`
})
