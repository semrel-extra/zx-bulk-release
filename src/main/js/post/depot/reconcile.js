import {api} from '../api/index.js'
import {log} from '../log.js'
import {getLatestTag} from './generators/meta.js'
import {analyze} from './steps/analyze.js'

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

  // The release behind that tag is ours to build on: analyze again from it. No changes since — nothing to release.
  if (await api.git.isAncestor(cwd, commit, ctx.git.sha)) {
    log.info(`preflight: ${pkg.tag} — we are newer, analyzing from the fetched tags`)
    pkg.latest = {...pkg.latest, tag: await getLatestTag(pkg.absPath, pkg.name)}
    await analyze(pkg, ctx)
    return pkg.releaseType ? 'refetch' : 'skip'
  }

  // diverged — anomaly
  log.warn(`preflight: ${pkg.tag} — diverged commits, skipping`)
  return 'skip'
}
