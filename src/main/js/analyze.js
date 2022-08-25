import {ctx, semver} from 'zx-extra'
import {updateDeps} from './deps.js'

export const analyze = async (pkg, packages) => {
  const semanticChanges = await getSemanticChanges(pkg.absPath, pkg.latest.tag?.ref)
  const depsChanges = await updateDeps(pkg, packages)
  const changes = [...semanticChanges, ...depsChanges]

  pkg.changes = changes
  pkg.version = resolvePkgVersion(changes, pkg.latest.tag?.version || pkg.manifest.version)
  pkg.manifest.version = pkg.version

  console.log(`[${pkg.name}] semantic changes`, changes)
}

export const releaseSeverityOrder = ['major', 'minor', 'patch']
export const semanticRules = [
  {group: 'Features', releaseType: 'minor', prefixes: ['feat']},
  {group: 'Fixes & improvements', releaseType: 'patch', prefixes: ['fix', 'perf', 'refactor', 'docs']},
  {group: 'BREAKING CHANGES', releaseType: 'major', keywords: ['BREAKING CHANGE', 'BREAKING CHANGES']},
]

export const getPkgCommits = async (cwd, since) => ctx(async ($) => {
  const range = since ? `${since}..HEAD` : 'HEAD'

  $.cwd = cwd
  return (await $.raw`git log ${range} --format=+++%s__%b__%h__%H -- .`)
    .toString()
    .split('+++')
    .filter(Boolean)
    .map(msg => {
      const [subj, body, short, hash] = msg.split('__').map(raw => raw.trim())
      return {subj, body, short, hash}
    })
})

export const getSemanticChanges = async (cwd, since) => {
  const commits = await getPkgCommits(cwd, since)
  const semanticChanges = commits
    .reduce((acc, {subj, body, short, hash}) => {
    semanticRules.forEach(({group, releaseType, prefixes, keywords}) => {
      const prefixMatcher = prefixes && new RegExp(`^(${prefixes.join('|')})(\\([a-z0-9\\-_]\\))?:\\s.+$`)
      const keywordsMatcher = keywords && new RegExp(`(${keywords.join('|')}):\\s(.+)`)
      const change = subj.match(prefixMatcher)?.[0] || body.match(keywordsMatcher)?.[2]

      if (change) {
        acc.push({
          group,
          releaseType,
          change,
          subj,
          body,
          short,
          hash
        })
      }
    })
    return acc
  }, [])

  return semanticChanges
}

export const getNextReleaseType = (changes) => releaseSeverityOrder.find(type => changes.find(({releaseType}) => type === releaseType))

export const getNextVersion = (changes, prevVersion) => {
  if (!prevVersion) return '1.0.0'

  const releaseType = getNextReleaseType(changes)

  return semver.inc(prevVersion, releaseType)
}

export const resolvePkgVersion = (changes, prevVersion) =>
  changes.length > 0
    ? getNextVersion(changes, prevVersion)
    : prevVersion || null
