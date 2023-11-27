import {memoizeBy} from '../util.js'
import {exec} from '../processor/exec.js'
import {$, within} from 'zx-extra'
import {npmPersist, npmPublish} from '../api/npm.js'
import {prepareMeta, pushMeta, pushReleaseTag} from '../processor/meta.js'
import {pushChangelog} from '../api/changelog.js'
import {ghPages, ghRelease} from '../api/gh.js'

export const publish = memoizeBy(async (pkg, run = exec) => within(async () => {
  $.scope = pkg.name

  // Debug
  // https://www.npmjs.com/package/@packasso/preset-ts-tsc-uvu/v/0.0.0?activeTab=code
  // https://github.com/qiwi/packasso/actions/runs/4514909191/jobs/7951564982#step:7:817
  // https://github.com/qiwi/packasso/blob/meta/2023-3-24-packasso-preset-ts-tsc-uvu-0-21-0-f0.json
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
    await Promise.all([
      pushMeta(pkg),
      pushChangelog(pkg),
      npmPublish(pkg),
      ghRelease(pkg),
      ghPages(pkg),
      run(pkg, 'publishCmd')
    ])
  }
  pkg.published = true
}))
