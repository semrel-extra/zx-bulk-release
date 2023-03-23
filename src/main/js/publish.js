import {fs, path, $} from 'zx-extra'
import {formatTag, pushTag} from './meta.js'
import {pushCommit, getRepo} from './git.js'
import {npmPublish} from './npm.js'
import {pushChangelog, formatReleaseNotes} from './changelog.js'
import {msgJoin} from './util.js'
import {runCmd} from './processor.js'
import {log} from './log.js'
import {pushMeta} from './meta.js'

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
