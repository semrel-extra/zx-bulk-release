import {memoizeBy} from '../util.js'
import {exec} from '../processor/exec.js'
import {$, within} from 'zx-extra'
import {npmPersist} from '../api/npm.js'
import {pushReleaseTag} from '../processor/meta.js'
import {publishers, isNpmPublished} from './publishers.js'
import {rollbackRelease} from './teardown.js'

export const publish = memoizeBy(async (pkg, run = exec) => within(async () => {
  $.scope = pkg.name

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
        await rollbackRelease(pkg)
      }
      throw e
    }
  }
  pkg.published = true
}))
