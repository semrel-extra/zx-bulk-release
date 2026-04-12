import {memoizeBy} from '../../../util.js'
import {exec} from '../exec.js'
import {deliver, channels, runChannel} from '../../courier/index.js'

export const publish = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  if (pkg.version !== pkg.manifest.version)
    throw new Error('package.json version not synced')

  const {run = exec, channels: channelNames = [], flags} = ctx
  const {tars = []} = pkg

  await deliver(tars, ctx.env)

  const cmd = channels.cmd
  if (channelNames.includes('cmd') && cmd?.when(pkg) && (!flags.snapshot || cmd.snapshot))
    await runChannel('cmd', pkg, run)

  pkg.published = true
})
