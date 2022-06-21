import {formatTag, getLatestTag} from './tag.js'
import {tempy, ctx, fs, path} from 'zx-extra'
import {copydir} from 'git-glob-cp'

const branches = {}
const META_VERSION = '1'

export const getOrigin = (cwd) => ctx(async ($) => {
  $.cwd = cwd
  const {ghToken, ghUser} = parseEnv($.env)
  const originUrl = (await $`git config --get remote.origin.url`).toString().trim()
  const [,,repoHost, repoName] = originUrl.replace(':', '/').replace(/\.git/, '').match(/.+(@|\/\/)([^/]+)\/(.+)$/) || []

  return ghToken && ghUser && repoHost && repoName?
    `https://${ghUser}:${ghToken}@${repoHost}/${repoName}`
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

export const push = async ({cwd, from, to, branch, origin, msg, ignoreFiles, files = []}) => ctx(async ($) => {
  const _cwd = await fetch({cwd, branch, origin})
  const {gitCommitterEmail, gitCommitterName} = parseEnv($.env)

  for (let {relpath, contents} of files) {
    const _contents = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
    await fs.outputFile(path.resolve(_cwd, to, relpath), _contents)
  }
  if (from) await copydir({baseFrom: cwd, from, baseTo: _cwd, to, ignoreFiles})

  $.cwd = _cwd

  await $`git config user.name ${gitCommitterEmail}`
  await $`git config user.email ${gitCommitterName}`
  await $`git add .`
  await $`git commit -m ${msg}`
  await $.raw`git push origin HEAD:refs/heads/${branch}`
})

export const publish = async (pkg, env) => ctx(async ($) => {
  const {name, version} = pkg.manifest
  const tag = formatTag({name, version})
  const cwd = pkg.absPath
  const {gitCommitterEmail, gitCommitterName, npmRegistry} = parseEnv(env)

  $.cwd = cwd
  $.env = env

  console.log(`push release tag ${tag}`)
  await $`git config user.name ${gitCommitterName}`
  await $`git config user.email ${gitCommitterEmail}`
  await $`git tag -m ${tag} ${tag}`
  await $`git push origin ${tag}`

  console.log('push artifact to branch `meta`')
  await pushMeta(pkg)

  console.log(`publish npm package to ${npmRegistry}`)
  const npmrc = path.resolve(cwd, '.npmrc')
  await $.raw`echo ${npmRegistry.replace(/https?:/, '')}/:_authToken=${$.env.NPM_TOKEN} >> ${npmrc}`
  await $`npm publish --no-git-tag-version --registry=${npmRegistry} --userconfig ${npmrc} --no-workspaces`

  console.log('create gh release')
  await createGhRelease(pkg)
})

export const getArtifactPath = (tag) => tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')

export const getLatestMeta = async (cwd, tag) => {
  if (!tag) return null

  try {
    const _cwd = await fetch({cwd, branch: 'meta'})
    return await fs.readJson(path.resolve(_cwd, getArtifactPath(tag), 'meta.json'))
  } catch {}

  return null
}

export const pushMeta = async (pkg) => {
  const cwd = pkg.absPath
  const {name, version} = pkg
  const tag = formatTag({name, version})
  const to = getArtifactPath(tag)
  const branch =  'meta'
  const msg =  `chore: release meta ${name} ${version}`
  const meta = {
    META_VERSION,
    name: pkg.name,
    version: pkg.version,
    dependencies: pkg.dependencies,
    devDependencies: pkg.devDependencies,
    peerDependencies: pkg.peerDependencies,
    optionalDependencies: pkg.optionalDependencies,
  }
  const files = [{relpath: 'meta.json', contents: meta}]

  await push({cwd, to, branch, msg, files})
}

export const getLatest = async (cwd, name) => {
  const tag = await getLatestTag(cwd, name)
  const meta = await getLatestMeta(cwd, tag?.ref)

  return {
    tag,
    meta
  }
}

export const parseEnv = (env = process.env) => {
  const {GH_USER, GH_USERNAME, GITHUB_USER, GITHUB_USERNAME, GH_TOKEN, GITHUB_TOKEN, NPM_TOKEN, NPM_REGISTRY, GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL} = env

  return {
    ghUser: GH_USER || GH_USERNAME || GITHUB_USER || GITHUB_USERNAME,
    ghToken: GH_TOKEN || GITHUB_TOKEN,
    npmToken: NPM_TOKEN,
    npmRegistry: NPM_REGISTRY || 'https://registry.npmjs.org',
    gitCommitterName: GIT_COMMITTER_NAME || 'Semrel Extra Bot',
    gitCommitterEmail: GIT_COMMITTER_EMAIL || 'semrel-extra-bot@hotmail.com',
  }
}

export const parseRepo = (cwd, origin) => ctx(async ($) => {
  $.cwd = cwd
  const originUrl = origin || (await $`git config --get remote.origin.url`).toString().trim()
  const [,,repoHost, repoName] = originUrl.replace(':', '/').replace(/\.git/, '').match(/.+(@|\/\/)([^/]+)\/(.+)$/) || []

  const repoPublicUrl = `https://${repoHost}/${repoName}`
  return {
    repoName,
    repoHost,
    repoPublicUrl
  }
})

export const createGhRelease = (pkg) => ctx(async ($) => {
  const cwd = pkg.absPath
  const {name, version} = pkg
  const {ghUser, ghToken} = parseEnv($.env)
  const {repoName, repoPublicUrl} = await parseRepo(cwd)

  if (!ghToken || !ghUser) return null

  const tag = formatTag({name, version})
  const releaseDiffRef = `## [${name}@${version}](${repoPublicUrl}/compare/${pkg.latest.tag?.ref}...${tag}) (${new Date().toISOString().slice(0, 10)})`
  const releaseDetails = Object.values(pkg.changes
    .reduce((acc, {group, subj, short, hash}) => {
      const {commits} = acc[group] || (acc[group] = {commits: [], group})
      const commitRef = `* ${subj}${short ? ` [${short}](${repoPublicUrl}/commit/${hash})` : ''}`

      commits.push(commitRef)

      return acc
    }, {}))
    .map(({group, commits}) => `
### ${group}
${commits.join('\n')}`).join('\n')

  const releaseNotes = releaseDiffRef + '\n' + releaseDetails + '\n'
  const releaseData = JSON.stringify({
    name: tag,
    tag_name: tag,
    body: releaseNotes
  })

  $.cwd = cwd
  await $`curl -u ${ghUser}:${ghToken} -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/${repoName}/releases -d ${releaseData}`
})