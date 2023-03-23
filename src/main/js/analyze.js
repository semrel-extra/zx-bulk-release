import {semver} from 'zx-extra'
import {updateDeps} from './deps.js'
import {formatTag} from './tag.js';
import {log} from './log.js'
import {getCommits} from './repo.js'

export const analyze = async (pkg, packages) => {
  const semanticChanges = await getSemanticChanges(pkg.absPath, pkg.latest.tag?.ref)
  const depsChanges = await updateDeps(pkg, packages)
  const changes = [...semanticChanges, ...depsChanges]
  const releaseType = getNextReleaseType(changes)

  pkg.changes = changes
  pkg.releaseType = releaseType
  pkg.version = resolvePkgVersion(releaseType, pkg.latest.tag?.version || pkg.manifest.version)
  pkg.manifest.version = pkg.version
  pkg.tag = releaseType ? formatTag({name: pkg.name, version: pkg.version}) : null

  log({pkg})('semantic changes', changes)
}

export const releaseSeverityOrder = ['major', 'minor', 'patch']
export const semanticRules = [
  {group: 'Features', releaseType: 'minor', prefixes: ['feat']},
  {group: 'Fixes & improvements', releaseType: 'patch', prefixes: ['fix', 'perf', 'refactor', 'docs', 'patch']},
  {group: 'BREAKING CHANGES', releaseType: 'major', keywords: ['BREAKING CHANGE', 'BREAKING CHANGES']},
]

export const getSemanticChanges = async (cwd, from, to) => {
  const commits = await getCommits(cwd, from, to)

  return analyzeCommits(commits)
}

export const analyzeCommits = (commits) =>
  commits.reduce((acc, {subj, body, short, hash}) => {
    semanticRules.forEach(({group, releaseType, prefixes, keywords}) => {
      const prefixMatcher = prefixes && new RegExp(`^(${prefixes.join('|')})(\\([a-z0-9\\-_,]+\\))?:\\s.+$`)
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

export const getNextReleaseType = (changes) => changes.length
  ? releaseSeverityOrder.find(type => changes.find(({releaseType}) => type === releaseType))
  : null

export const getNextVersion = (releaseType, prevVersion) => {
  if (!prevVersion) return '1.0.0'

  return semver.inc(prevVersion, releaseType)
}

export const resolvePkgVersion = (releaseType, prevVersion) =>
  releaseType
    ? getNextVersion(releaseType, prevVersion)
    : prevVersion || null
