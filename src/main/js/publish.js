import {formatTag, getLatestTag} from './tag.js'
import {tempy, ctx, fs, path, $} from 'zx-extra'
import {copydir} from 'git-glob-cp'
import {parseEnv} from './config.js'
import {npmPublish} from './npm.js'

export const publish = async (pkg) => {
  await pushTag(pkg)
  await pushMeta(pkg)
  await pushChangelog(pkg)
  await npmPublish(pkg)
  await ghRelease(pkg)
  await ghPages(pkg)
}

export const pushTag = (pkg) => ctx(async ($) => {
  const {absPath: cwd, name, version} = pkg
  const tag = formatTag({name, version})
  const {gitCommitterEmail, gitCommitterName} = parseEnv($.env)

  console.log(`[${name}] push release tag ${tag}`)

  $.cwd = cwd
  await $`git config user.name ${gitCommitterName}`
  await $`git config user.email ${gitCommitterEmail}`
  await $`git tag -m ${tag} ${tag}`
  await $`git push origin ${tag}`
})

export const pushMeta = async (pkg) => {
  console.log(`[${pkg.name}] push artifact to branch 'meta'`)

  const cwd = pkg.absPath
  const {name, version} = pkg
  const tag = formatTag({name, version})
  const to = '.'
  const branch = 'meta'
  const msg = `chore: release meta ${name} ${version}`
  const hash = (await $.o({cwd})`git rev-parse HEAD`).toString().trim()
  const meta = {
    META_VERSION: '1',
    name: pkg.name,
    hash,
    version: pkg.version,
    dependencies: pkg.dependencies,
    devDependencies: pkg.devDependencies,
    peerDependencies: pkg.peerDependencies,
    optionalDependencies: pkg.optionalDependencies,
  }
  const files = [{relpath: `${getArtifactPath(tag)}.json`, contents: meta}]

  await push({cwd, to, branch, msg, files})
}

export const ghRelease = async (pkg) => {
  console.log(`[${pkg.name}] create gh release`)

  const {ghUser, ghToken} = parseEnv($.env)
  if (!ghToken || !ghUser) return null

  const {name, version, absPath: cwd} = pkg
  const {repoName} = await parseRepo(cwd)
  const tag = formatTag({name, version})
  const releaseNotes = await formatReleaseNotes(pkg)
  const releaseData = JSON.stringify({
    name: tag,
    tag_name: tag,
    body: releaseNotes
  })

  await $.o({cwd})`curl -u ${ghUser}:${ghToken} -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/${repoName}/releases -d ${releaseData}`
}

const pushChangelog = async (pkg) => {
  const {config: {changelog: opts}} = pkg
  if (!opts) return

  console.log(`[${pkg.name}] push changelog`)
  const [branch = 'changelog', file = `${pkg.name.replace(/[^a-z0-9-]/ig, '')}-changelog.md`, msg = `chore: update changelog ${pkg.name}`] = typeof opts === 'string'
    ? opts.split(' ')
    : [opts.branch, opts.file, opts.msg]
  const _cwd = await fetch({cwd: pkg.absPath, branch})
  const releaseNotes = await formatReleaseNotes(pkg)

  await $.o({cwd: _cwd})`echo ${releaseNotes}"\n$(cat ./${file})" > ./${file}`
  await push({cwd: _cwd, branch, msg})
}

const formatReleaseNotes = async (pkg) => {
  const {name, version, absPath: cwd} = pkg
  const {repoPublicUrl} = await parseRepo(cwd)
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

  return releaseDiffRef + '\n' + releaseDetails + '\n'
}

const ghPages = async (pkg) => {
  const {config: {ghPages: opts}} = pkg
  if (!opts) return

  const [branch = 'gh-pages', from = 'docs', to = '.', msg = `docs: update docs ${pkg.name} ${pkg.version}`] = typeof opts === 'string'
    ? opts.split(' ')
    : [opts.branch, opts.from, opts.to, opts.msg]

  console.log(`[${pkg.name}] publish docs to ${branch}`)

  await push({
    cwd: path.join(pkg.absPath, from),
    from: '.',
    to,
    branch,
    msg
  })
}

const branches = {}
export const fetch = async ({cwd: _cwd, branch, origin: _origin}) => ctx(async ($) => {
  let cwd = branches[branch]
  if (cwd) return cwd

  const origin = _origin || (await parseRepo(_cwd)).repoAuthedUrl

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
  if (from) await copydir({baseFrom: cwd, from, baseTo: _cwd, to, ignoreFiles, cwd})

  $.cwd = _cwd

  await $`git config user.name ${gitCommitterEmail}`
  await $`git config user.email ${gitCommitterName}`
  await $`git add .`
  try {
    await $`git commit -m ${msg}`
  } catch {
    console.warn('no changes')
    return
  }

  await $.raw`git push origin HEAD:refs/heads/${branch}`
})

export const getArtifactPath = (tag) => tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')

export const getLatestMeta = async (cwd, tag) => {
  if (!tag) return null

  try {
    const _cwd = await fetch({cwd, branch: 'meta'})
    return await Promise.any([
      fs.readJson(path.resolve(_cwd, `${getArtifactPath(tag)}.json`)),
      fs.readJson(path.resolve(_cwd, getArtifactPath(tag), 'meta.json'))
    ])
  } catch {}

  return null
}

export const getLatest = async (cwd, name) => {
  const tag = await getLatestTag(cwd, name)
  const meta = await getLatestMeta(cwd, tag?.ref)

  return {
    tag,
    meta
  }
}

export const parseRepo = async (cwd) => {
  const {ghToken, ghUser} = parseEnv($.env)
  const originUrl = await getOrigin(cwd)
  const [,,repoHost, repoName] = originUrl.replace(':', '/').replace(/\.git/, '').match(/.+(@|\/\/)([^/]+)\/(.+)$/) || []
  const repoPublicUrl = `https://${repoHost}/${repoName}`
  const repoAuthedUrl = ghToken && ghUser && repoHost && repoName?
    `https://${ghUser}:${ghToken}@${repoHost}/${repoName}`
    : originUrl

  return {
    repoName,
    repoHost,
    repoPublicUrl,
    repoAuthedUrl,
    originUrl,
  }
}

const origins = {}
export const getOrigin = async (cwd) => {
  if (!origins[cwd]) {
    origins[cwd] = (await $.o({cwd})`git config --get remote.origin.url`).toString().trim()
  }

  return origins[cwd]
}
