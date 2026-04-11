import {memoizeBy} from '../../../util.js'
import {exec} from '../exec.js'
import {deliver, filterActive, runChannel, buildParcel} from '../../courier/index.js'
import {isNpmPublished} from '../../courier/channels/npm.js'
import {rollbackRelease} from './teardown.js'

export const publish = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  if (pkg.version !== pkg.manifest.version)
    throw new Error('package.json version not synced')

  const {run = exec, channels: channelNames = [], flags} = ctx
  const snapshot = !!flags.snapshot
  const {artifacts = {}, activeTransport = []} = pkg

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
