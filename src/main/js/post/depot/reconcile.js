import {api} from '../api/index.js'
import {log} from '../log.js'
import {formatTag} from './generators/tag.js'
import {resolvePkgVersion} from './steps/analyze.js'

export const preflight = async (pkg, ctx) => {
  if (!pkg.tag) return 'ok'

  const cwd = ctx.git.root
  const commit = await api.git.getRemoteTagCommit(cwd, pkg.tag)
  if (!commit) return 'ok'

  // tag exists on remote
  if (commit === ctx.git.sha) {
    log.info(`preflight: ${pkg.tag} already exists for our commit, skipping`)
    return 'skip'
  }

  // bring the tagged commit and enough history for merge-base
  await api.git.fetchTags(cwd)
  await api.git.deepen(cwd, 100)

  if (await api.git.isAncestor(cwd, ctx.git.sha, commit)) {
    log.info(`preflight: ${pkg.tag} — we are older, skipping`)
    return 'skip'
  }

  if (await api.git.isAncestor(cwd, commit, ctx.git.sha)) {
    log.info(`preflight: ${pkg.tag} — we are newer, re-resolving version`)
    const pre = ctx.flags.snapshot ? `-snap.${ctx.git.sha.slice(0, 7)}` : undefined
    // re-resolve: the fetched tags will give us a new latest version
    const latestVersion = pkg.latest.tag?.version || pkg.manifest.version
    pkg.version = resolvePkgVersion(pkg.releaseType, latestVersion, pkg.manifest.version, pre)
    pkg.manifest.version = pkg.version
    pkg.tag = formatTag({name: pkg.name, version: pkg.version, format: pkg.config.tagFormat})
    return 'refetch'
  }

  // diverged — anomaly
  log.warn(`preflight: ${pkg.tag} — diverged commits, skipping`)
  return 'skip'
}
