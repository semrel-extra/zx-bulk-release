import {memoizeBy} from '../../../util.js'
import {exec} from '../exec.js'
import {log} from '../../log.js'
import {deliver, filterActive, runChannel, buildParcel} from '../../courier/index.js'
import {pushTag} from '../../api/git.js'
import {isNpmPublished} from '../../courier/channels/npm.js'
import {rollbackRelease} from './teardown.js'

export const publish = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  if (pkg.version !== pkg.manifest.version)
    throw new Error('package.json version not synced')

  const {run = exec, channels: channelNames = [], flags} = ctx
  const snapshot = !!flags.snapshot
  const {artifacts = {}, activeTransport = []} = pkg

  // Tag is depot's responsibility — the commitment point.
  if (!snapshot) {
    const {tag, config: {gitCommitterEmail, gitCommitterName}} = pkg
    ctx.git.tag = tag
    log.info(`push release tag ${tag}`)
    await pushTag({cwd: ctx.git.root, tag, gitCommitterEmail, gitCommitterName})
  }

  const parcel = buildParcel(pkg, ctx, {
    snapshot,
    channels: activeTransport,
    ...artifacts,
  })

  const cmdActive = channelNames.includes('cmd') && filterActive(['cmd'], pkg, {snapshot}).length > 0

  try {
    await deliver(parcel)
    if (cmdActive) await runChannel('cmd', pkg, run)
  } catch (e) {
    if (!snapshot && isNpmPublished(pkg)) await rollbackRelease(pkg, ctx)
    throw e
  }

  pkg.published = true
})
