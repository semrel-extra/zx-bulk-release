import os from 'node:os'
import {createRequire} from 'node:module'
import {$, within} from 'zx-extra'
import {queuefy} from '../util.js'

import {createReport, log} from './log.js'
import {topo} from './depot/deps.js'
import {exec} from './depot/exec.js'
import {defaultOrder as channels} from './courier/index.js'
import {runReceive} from './modes/receive.js'
import {runVerify} from './modes/verify.js'
import {runDeliver} from './modes/deliver.js'
import {runPack} from './modes/pack.js'

const ZBR_VERSION = createRequire(import.meta.url)('../../../../package.json').version

export {ZBR_VERSION as version}

export const run = async ({cwd = process.cwd(), env: _env, flags = {}} = {}) => within(async () => {
  const env = {...process.env, ..._env}
  log.secret(env.GH_TOKEN, env.GITHUB_TOKEN, env.NPM_TOKEN)
  log.info(`zx-bulk-release@${ZBR_VERSION}`)

  const _log = $.log
  $.log = (entry) => {
    if (entry.kind === 'cmd' && $.scope) {
      entry = {...entry, cmd: `[${$.scope}] ${entry.cmd}`}
    }
    _log(entry)
  }

  if (flags.verify)  return runVerify({cwd, flags})
  if (flags.deliver) return runDeliver({env, flags})

  const ctx = await createContext({flags, env, cwd})
  if (flags.receive) return runReceive({cwd, env, flags}, ctx)
  return runPack({cwd, env, flags}, ctx)
})

export const createContext = async ({flags, env, cwd}) => {
  // Ensure remote tags are up-to-date before analysis to avoid
  // inconsistencies between receive (context) and pack (parcels).
  try { await $({cwd, quiet: true})`git fetch origin --tags --force` } catch { /* offline / bare */ }

  const {packages, queue, root, prev, graphs} = await topo({cwd, flags})
  const report = createReport({packages, queue, flags})

  $.report  = report
  $.env     = env
  $.verbose = !!(flags.debug || env.DEBUG) || $.verbose
  $.quiet   = !$.verbose
  $.memo    = new Map()

  return {cwd, env, flags, root, packages, queue, prev, graphs, report, channels,
    run: queuefy(exec, flags.concurrency || os.cpus().length)}
}
