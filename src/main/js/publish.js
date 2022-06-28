import {formatTag, getLatestTag} from './tag.js'
import {ctx, fs, path, $} from 'zx-extra'
import {push, fetch, parseRepo} from './repo.js'
import {parseEnv} from './config.js'
import {fetchManifest, npmPublish} from './npm.js'

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
  await push({cwd: pkg.absPath, branch, msg})
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

export const getLatest = async (pkg) => {
  const {absPath: cwd, name} = pkg
  const tag = await getLatestTag(cwd, name)
  const meta = await getLatestMeta(cwd, tag?.ref) || await fetchManifest(pkg, {nothrow: true})

  return {
    tag,
    meta
  }
}
