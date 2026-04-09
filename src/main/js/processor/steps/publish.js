import {memoizeBy} from '../../util.js'
import {exec} from '../exec.js'
import {log} from '../../log.js'
import {npmPersist} from '../api/npm.js'
import {pushTag} from '../api/git.js'
import {formatTag} from '../generators/tag.js'
import {isNpmPublished} from '../publishers/npm.js'
import {rollbackRelease} from './teardown.js'

const pushReleaseTag = async (pkg, ctx) => {
  const {name, version, tag = formatTag({name, version}), config: {gitCommitterEmail, gitCommitterName}} = pkg
  ctx.git.tag = tag
  log({pkg})(`push release tag ${tag}`)
  await pushTag({cwd: ctx.git.root, tag, gitCommitterEmail, gitCommitterName})
}

export const publish = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  if (pkg.version !== pkg.manifest.version)
    throw new Error('package.json version not synced')

  const {run = exec, publishers = [], flags} = ctx
  const snapshot = !!flags.snapshot
  const active = publishers.filter(p => (!snapshot || p.snapshot) && p.when(pkg))

  await npmPersist(pkg)

  // Prepare phase: serial pkg mutations (e.g. meta injects into ghAssets) — must finish before any run().
  for (const p of active) await p.prepare?.(pkg)

  if (!snapshot) await pushReleaseTag(pkg, ctx)
  try {
    await Promise.all(active.map(p => p.run(pkg, run)))
  } catch (e) {
    // Roll back full release for npm-published packages; git-tag-only packages keep their tag — it IS the release.
    if (!snapshot && isNpmPublished(pkg)) await rollbackRelease(pkg, ctx)
    throw e
  }
  pkg.published = true
})
