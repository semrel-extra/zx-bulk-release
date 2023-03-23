import {fs, path, $} from 'zx-extra'
import {formatTag, getLatestTag, pushTag} from './tag.js'
import {pushCommit, fetchRepo, getRepo} from './repo.js'
import {fetchManifest, npmPublish} from './npm.js'
import {msgJoin} from './util.js'
import {runCmd} from './processor.js'
import {log} from './log.js'

export const publish = async (pkg, run = runCmd) => {
  await fs.writeJson(pkg.manifestPath, pkg.manifest, {spaces: 2})
  await pushTag(pkg)
  await pushMeta(pkg)
  await pushChangelog(pkg)
  await npmPublish(pkg)
  await ghRelease(pkg)
  await ghPages(pkg)
  await run(pkg, 'publishCmd')
}

export const pushMeta = async (pkg) => {
  log({pkg})('push artifact to branch \'meta\'')

  const {name, version, absPath: cwd, config: {gitCommitterEmail, gitCommitterName, ghBasicAuth: basicAuth}} = pkg
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

  await pushCommit({cwd, to, branch, msg, files, gitCommitterEmail, gitCommitterName, basicAuth})
}

export const ghRelease = async (pkg) => {
  log({pkg})(`create gh release`)

  const {ghBasicAuth: basicAuth, ghToken} = pkg.config
  if (!ghToken) return null

  const {name, version, absPath: cwd} = pkg
  const {repoName} = await getRepo(cwd, {basicAuth})
  const tag = formatTag({name, version})
  const releaseNotes = await formatReleaseNotes(pkg)
  const releaseData = JSON.stringify({
    name: tag,
    tag_name: tag,
    body: releaseNotes
  })

  await $.o({cwd})`curl -H "Authorization: token ${ghToken}" -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/${repoName}/releases -d ${releaseData}`
}

const pushChangelog = async (pkg) => {
  const {absPath: cwd, config: {changelog: opts, gitCommitterEmail, gitCommitterName, ghBasicAuth: basicAuth}} = pkg
  if (!opts) return

  log({pkg})('push changelog')
  const [branch = 'changelog', file = `${pkg.name.replace(/[^a-z0-9-]/ig, '')}-changelog.md`, ..._msg] = typeof opts === 'string'
    ? opts.split(' ')
    : [opts.branch, opts.file, opts.msg]
  const _cwd = await fetchRepo({cwd, branch, basicAuth})
  const msg = msgJoin(_msg, pkg, 'chore: update changelog ${{name}}')
  const releaseNotes = await formatReleaseNotes(pkg)

  await $.o({cwd: _cwd})`echo ${releaseNotes}"\n$(cat ./${file})" > ./${file}`
  await pushCommit({cwd, branch, msg, gitCommitterEmail, gitCommitterName, basicAuth})
}

const formatReleaseNotes = async (pkg) => {
  const {name, version, absPath: cwd, config: {ghBasicAuth: basicAuth}} = pkg
  const {repoPublicUrl} = await getRepo(cwd, {basicAuth})
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
  const {config: {ghPages: opts, gitCommitterEmail, gitCommitterName, ghBasicAuth: basicAuth}} = pkg
  if (!opts) return

  const [branch = 'gh-pages', from = 'docs', to = '.', ..._msg] = typeof opts === 'string'
    ? opts.split(' ')
    : [opts.branch, opts.from, opts.to, opts.msg]
  const msg = msgJoin(_msg, pkg, 'docs: update docs ${{name}} ${{version}}')

  log({pkg})(`publish docs to ${branch}`)

  await pushCommit({
    cwd: path.join(pkg.absPath, from),
    from: '.',
    to,
    branch,
    msg,
    gitCommitterEmail,
    gitCommitterName,
    basicAuth
  })
}

export const getArtifactPath = (tag) => tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')

export const getLatestMeta = async (cwd, tag) => {
  if (!tag) return null

  try {
    const _cwd = await fetchRepo({cwd, branch: 'meta'})
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
