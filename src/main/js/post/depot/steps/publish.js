import {memoizeBy} from '../../../util.js'
import {exec} from '../exec.js'
import {log} from '../../log.js'
import {deliver, channels, runChannel} from '../../courier/index.js'
import {pushTag} from '../../api/git.js'

export const publish = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  if (pkg.version !== pkg.manifest.version)
    throw new Error('package.json version not synced')

  const {run = exec, channels: channelNames = [], flags} = ctx
  const snapshot = !!flags.snapshot
  const {tars = []} = pkg

  if (!snapshot) {
    const {tag, config: {gitCommitterEmail, gitCommitterName}} = pkg
    ctx.git.tag = tag
    log.info(`push release tag ${tag}`)
    await pushTag({cwd: ctx.git.root, tag, gitCommitterEmail, gitCommitterName})
  }

  await deliver(tars, ctx.env)

  const cmd = channels.cmd
  if (channelNames.includes('cmd') && cmd?.when(pkg) && (!snapshot || cmd.snapshot))
    await runChannel('cmd', pkg, run)

  pkg.published = true
})
