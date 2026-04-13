import {$} from 'zx-extra'
import {api} from '../api/index.js'
import {log} from '../log.js'
import {formatTag} from './generators/tag.js'
import {resolvePkgVersion} from './steps/analyze.js'

export const preflight = async (pkg, ctx) => {
  if (!pkg.tag) return 'ok'

  const cwd = ctx.git.root
  const remoteSha = await api.git.getRemoteTagSha(cwd, pkg.tag)
  if (!remoteSha) return 'ok'

  // tag exists on remote
  if (remoteSha === ctx.git.sha) {
    log.info(`preflight: ${pkg.tag} already exists for our commit, skipping`)
    return 'skip'
  }

  // need history for merge-base
  await $({cwd, nothrow: true})`git fetch --deepen=100`

  const isOursOlder = await $({cwd, nothrow: true})`git merge-base --is-ancestor ${ctx.git.sha} ${remoteSha}`
  if (isOursOlder.exitCode === 0) {
    log.info(`preflight: ${pkg.tag} — we are older, skipping`)
    return 'skip'
  }

  const isRemoteOlder = await $({cwd, nothrow: true})`git merge-base --is-ancestor ${remoteSha} ${ctx.git.sha}`
  if (isRemoteOlder.exitCode === 0) {
    log.info(`preflight: ${pkg.tag} — we are newer, re-resolving version`)
    await $({cwd})`git fetch origin --tags --force`
    api.git.clearTagsCache()

    const pre = ctx.flags.snapshot ? `-snap.${ctx.git.sha.slice(0, 7)}` : undefined
    // re-resolve: the fetched tags will give us a new latest version
    const latestVersion = pkg.latest.tag?.version || pkg.manifest.version
    pkg.version = resolvePkgVersion(pkg.releaseType, latestVersion, pkg.manifest.version, pre)
    pkg.manifest.version = pkg.version
    pkg.tag = formatTag({name: pkg.name, version: pkg.version, format: pkg.config.tagFormat})
    return 'ok'
  }

  // diverged — anomaly
  log.warn(`preflight: ${pkg.tag} — diverged commits, skipping`)
  return 'skip'
}
