// Release notes formatting. Pure except for a single getRepo() call to resolve repoPublicUrl.

import {getRepo} from '../../api/git.js'
import {formatTag} from './tag.js'

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
