import {$} from 'zx-extra'
import {log} from './log.js'
import {fetchRepo, getRepo, pushCommit} from './git.js'
import {msgJoin} from './util.js'
import {formatTag} from './meta.js'

export const pushChangelog = async (pkg) => {
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

export const formatReleaseNotes = async (pkg) => {
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
