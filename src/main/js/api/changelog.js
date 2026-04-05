import {$} from 'zx-extra'
import {queuefy} from 'queuefy'
import {fetchRepo, getRepo, pushCommit} from './git.js'
import {log} from '../log.js'
import {formatTag} from '../processor/meta.js'
import {msgJoin} from '../util.js'

export const pushChangelog = queuefy(async (pkg) => {
  const {absPath: cwd, config: {changelog: opts, gitCommitterEmail, gitCommitterName, ghBasicAuth: basicAuth}} = pkg
  if (!opts) return

  log({pkg})('push changelog')
  const [branch = 'changelog', file = `${pkg.name.replace(/[^a-z0-9-]/ig, '')}-changelog.md`, ..._msg] = typeof opts === 'string'
    ? opts.split(' ')
    : [opts.branch, opts.file, opts.msg]
  const _cwd = await fetchRepo({cwd, branch, basicAuth})
  const msg = msgJoin(_msg, pkg, 'chore: update changelog ${{name}}')
  const releaseNotes = await formatReleaseNotes(pkg)

  await $({cwd: _cwd})`echo ${releaseNotes}"\n$(cat ./${file})" > ./${file}`
  await pushCommit({cwd, branch, msg, gitCommitterEmail, gitCommitterName, basicAuth})
})

export const DIFF_TAG_URL = '${repoPublicUrl}/compare/${prevTag}...${newTag}'
export const DIFF_COMMIT_URL = '${repoPublicUrl}/commit/${hash}'

export const interpolate = (template, vars) => {
  const result = template.replace(/\$\{(\w+)}/g, (_, key) => vars[key] ?? '')
  try { new URL(result) } catch { throw new Error(`invalid URL after interpolation: '${result}' (template: '${template}')`) }
  return result
}

export const formatReleaseNotes = async (pkg) => {
  const {name, version, tag = formatTag({name, version}), absPath: cwd, config: {ghBasicAuth: basicAuth, diffTagUrl = DIFF_TAG_URL, diffCommitUrl = DIFF_COMMIT_URL}} = pkg
  const {repoPublicUrl, repoName} = await getRepo(cwd, {basicAuth})
  const prevTag = pkg.latest.tag?.ref
  const vars = {repoName, repoPublicUrl, prevTag, newTag: tag, name, version}
  const diffUrl = interpolate(diffTagUrl, vars)
  const releaseDiffRef = `## [${name}@${version}](${diffUrl}) (${new Date().toISOString().slice(0, 10)})`
  const releaseDetails = Object.values(pkg.changes
    .reduce((acc, {group, subj, short, hash}) => {
      const {commits} = acc[group] || (acc[group] = {commits: [], group})
      const commitUrl = interpolate(diffCommitUrl, {...vars, hash, short})
      const commitRef = `* ${subj}${short ? ` [${short}](${commitUrl})` : ''}`

      commits.push(commitRef)

      return acc
    }, {}))
    .map(({group, commits}) => `
### ${group}
${commits.join('\n')}`).join('\n')

  return releaseDiffRef + '\n' + releaseDetails + '\n'
}
