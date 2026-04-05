import {memoizeBy} from '../util.js'
import {exec} from '../processor/exec.js'
import {$, within} from 'zx-extra'
import {npmPersist, npmPublish} from '../api/npm.js'
import {prepareMeta, pushMeta, pushReleaseTag} from '../processor/meta.js'
import {pushChangelog} from '../api/changelog.js'
import {ghPages, ghRelease} from '../api/gh.js'
import {deleteRemoteTag} from '../api/git.js'

export const publish = memoizeBy(async (pkg, run = exec) => within(async () => {
  $.scope = pkg.name

  if (pkg.version !== pkg.manifest.version) {
    throw new Error('package.json version not synced')
  }

  await npmPersist(pkg)
  await prepareMeta(pkg)

  if (pkg.context.flags.snapshot) {
    await Promise.all([
      npmPublish(pkg),
      run(pkg, 'publishCmd')
    ])
  } else {
    await pushReleaseTag(pkg)
    try {
      await Promise.all([
        pushMeta(pkg),
        pushChangelog(pkg),
        npmPublish(pkg),
        ghRelease(pkg),
        ghPages(pkg),
        run(pkg, 'publishCmd')
      ])
    } catch (e) {
      // Rollback the tag only for npm-published packages so the next run can retry.
      // Git-tag-only packages (private or npmPublish: false) keep their tag — it IS the release.
      const needsNpm = !pkg.manifest.private && pkg.config.npmPublish !== false
      const cwd = pkg.context.git.root
      const tag = pkg.context.git.tag
      if (tag && needsNpm) {
        await deleteRemoteTag({cwd, tag})
      }
      throw e
    }
  }
  pkg.published = true
}))
