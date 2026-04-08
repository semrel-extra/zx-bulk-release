import {memoizeBy} from '../../util.js'
import {exec} from '../exec.js'
import {log} from '../../log.js'
import {npmPersist} from '../api/npm.js'
import {pushTag} from '../api/git.js'
import {formatTag} from '../generators/tag.js'
import {isNpmPublished} from '../publishers/npm.js'
import {rollbackRelease} from './teardown.js'

const pushReleaseTag = async (pkg) => {
  const {name, version, tag = formatTag({name, version}), config: {gitCommitterEmail, gitCommitterName}} = pkg
  pkg.context.git.tag = tag
  log({pkg})(`push release tag ${tag}`)
  await pushTag({cwd: pkg.context.git.root, tag, gitCommitterEmail, gitCommitterName})
}

export const publish = memoizeBy(async (pkg, ctx) => {
  const {run = exec, publishers = []} = ctx
  if (pkg.version !== pkg.manifest.version) {
    throw new Error('package.json version not synced')
  }

  await npmPersist(pkg)

  const snapshot = !!pkg.context.flags.snapshot
  const active = publishers.filter(p => (!snapshot || p.snapshot) && p.when(pkg))

  // Prepare phase: serial pkg mutations (e.g. meta injects itself into ghAssets).
  // Must complete before any run() so downstream publishers see the mutated state.
  for (const p of active) {
    if (p.prepare) await p.prepare(pkg)
  }

  if (snapshot) {
    await Promise.all(active.map(p => p.run(pkg, run)))
  } else {
    await pushReleaseTag(pkg)
    try {
      await Promise.all(active.map(p => p.run(pkg, run)))
    } catch (e) {
      // Rollback the entire failed release for npm-published packages.
      // Git-tag-only packages (private or npmPublish: false) keep their tag — it IS the release.
      if (isNpmPublished(pkg)) {
        await rollbackRelease(pkg, ctx)
      }
      throw e
    }
  }
  pkg.published = true
})
