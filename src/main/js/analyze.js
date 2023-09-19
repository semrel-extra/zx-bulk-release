import {semver} from 'zx-extra'
import {updateDeps} from './deps.js'
import {formatTag} from './meta.js';
import {log} from './log.js'
import {getCommits} from './git.js'

export const analyze = async (pkg) => {
  const semanticChanges = await getSemanticChanges(pkg.absPath, pkg.latest.tag?.ref, undefined, pkg.config.releaseRules)
  const depsChanges = await updateDeps(pkg)
  const changes = [...semanticChanges, ...depsChanges]
  const releaseType = getNextReleaseType(changes)
  const pre = pkg.context.flags.snapshot ? `-snap.${pkg.context.git.sha.slice(0, 7)}` : undefined
  const latestVersion = pkg.latest.tag?.version || pkg.latest.meta?.version

  pkg.changes = changes
  pkg.releaseType = releaseType
  pkg.version = resolvePkgVersion(
    releaseType,
    latestVersion,
    pkg.manifest.version,
    pre
  )
  pkg.preversion = pre && pkg.version
  pkg.manifest.version = pkg.version
  pkg.tag = releaseType ? formatTag({name: pkg.name, version: pkg.version, format: pkg.config.tagFormat}) : null

  log({pkg})(
    'semantic changes', changes,
    'releaseType', releaseType,
    'prevVersion', latestVersion,
    'nextVersion', pkg.version,
    'nextTag', pkg.tag
  )
}

export const releaseSeverityOrder = ['major', 'minor', 'patch']
export const semanticRules = [
  {group: 'Features', releaseType: 'minor', prefixes: ['feat']},
  {group: 'Fixes & improvements', releaseType: 'patch', prefixes: ['fix', 'perf', 'refactor', 'docs', 'patch']},
  {group: 'BREAKING CHANGES', releaseType: 'major', keywords: ['BREAKING CHANGE', 'BREAKING CHANGES']},
]

export const getSemanticChanges = async (cwd, from, to, rules = semanticRules) => {
  const commits = await getCommits(cwd, from, to)

  return analyzeCommits(commits, rules)
}

export const analyzeCommits = (commits, rules) =>
  commits.reduce((acc, {subj, body, short, hash}) => {
    rules.forEach(({group, releaseType, prefixes, keywords}) => {
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

export const getNextVersion = (releaseType, prevVersion, defaultVersion = '1.0.0', pre = '') =>
  (prevVersion
    ? semver.inc(prevVersion, releaseType)
    : defaultVersion) + pre

export const resolvePkgVersion = (releaseType, prevVersion, defaultVersion, pre) =>
  releaseType
    ? getNextVersion(releaseType, prevVersion, defaultVersion, pre)
    : prevVersion || null
