import {formatTag, getLatestTag} from './tag.js'
import {tempy, ctx, fs, path, $} from 'zx-extra'
import {copydir} from 'git-glob-cp'

const branches = {}

export const getOrigin = (cwd) => ctx(async ($) => {
  $.cwd = cwd
  const gitAuth = `${$.env.GH_USER}:${$.env.GITHUB_TOKEN}`
  const originUrl = (await $`git config --get remote.origin.url`).toString().trim()
  const [,,repoHost, repoName] = originUrl.replace(':', '/').replace(/\.git/, '').match(/.+(@|\/\/)([^/]+)\/(.+)$/) || []

  return repoHost ?
    `https://${gitAuth}@${repoHost}/${repoName}`
    : originUrl
})

export const fetch = async ({cwd: _cwd, branch, origin: _origin}) => ctx(async ($) => {
  let cwd = branches[branch]
  if (cwd) return cwd

  const origin = _origin || await getOrigin(_cwd)

  cwd = tempy.temporaryDirectory()
  $.cwd = cwd
  try {
    await $`git clone --single-branch --branch ${branch} --depth 1 ${origin} .`
  } catch {
    await $`git init .`
    await $`git remote add origin ${origin}`
  }

  branches[branch] = cwd

  return cwd
})

export const push = async ({cwd, from, to, branch, origin, msg, ignoreFiles}) => ctx(async ($) => {
  const _cwd = await fetch({cwd, branch, origin})
  await copydir({baseFrom: cwd, from, baseTo: _cwd, to})

  $.cwd = _cwd

  await $`git config user.name ${$.env.GIT_COMMITTER_NAME || 'Semrel Extra Bot'}`
  await $`git config user.email ${$.env.GIT_COMMITTER_EMAIL || 'semrel-extra-bot@hotmail.com'}`
  await $`git add .`
  await $`git commit -m ${msg}`
  await $.raw`git push origin HEAD:refs/heads/${branch}`
})

export const publish = async (pkg, env) => ctx(async ($) => {
  const {name, version, files} = pkg.manifest
  const cwd = pkg.absPath
  $.cwd = cwd
  $.env = env

  const tag = formatTag({name, version})
  const from = files ? [...files, 'package.json'] : ['!node_modules', '*']
  const to = getArtifactPath(tag)

  console.log(`push release tag ${tag}`)
  await $`git config user.name ${$.env.GIT_COMMITTER_NAME || 'Semrel Extra Bot'}`
  await $`git config user.email ${$.env.GIT_COMMITTER_EMAIL || 'semrel-extra-bot@hotmail.com'}`
  await $`git tag -m ${tag} ${tag}`
  await $`git push origin ${tag}`

  console.log('push artifact to branch `meta`')
  await push({cwd, from, to, branch: 'meta', msg: `chore: publish artifact ${name} ${version}`, ignoreFiles: '.npmignore'})

  const registry = env.NPM_REGISTRY || 'https://registry.npmjs.org'
  const npmrc = path.resolve(cwd, '.npmrc')
  console.log(`publish npm package to ${registry}`)

  await $.raw`echo ${registry.replace(/https?:/, '')}/:_authToken=${$.env.NPM_TOKEN} >> ${npmrc}`
  await $`npm publish --no-git-tag-version --registry=${registry} --userconfig ${npmrc} --no-workspaces`
})

export const getArtifactPath = (tag) => tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')

export const getLatestManifest = async (cwd, tag) => {
  if (!tag) return null

  try {
    const meta = await fetch({cwd, branch: 'meta'})
    return await fs.readJson(path.resolve(meta, getArtifactPath(tag), 'package.json'))
  } catch {}

  return null
}

export const getLatest = async (cwd, name) => {
  const tag = await getLatestTag(cwd, name)
  const manifest = await getLatestManifest(cwd, tag?.ref)

  return {
    tag,
    manifest
  }
}