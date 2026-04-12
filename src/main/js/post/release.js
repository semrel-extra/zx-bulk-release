import os from 'node:os'
import {createRequire} from 'node:module'
import {$, within} from 'zx-extra'
import {queuefy} from 'queuefy'

import {createReport, log} from './log.js'
import {topo} from './depot/deps.js'
import {exec} from './depot/exec.js'
import {defaultOrder as channels} from './courier/index.js'
import {runReceive} from './modes/receive.js'
import {runVerify} from './modes/verify.js'
import {runDeliver} from './modes/deliver.js'
import {runPack} from './modes/pack.js'

const ZBR_VERSION = createRequire(import.meta.url)('../../../../package.json').version

const HELP = `
zx-bulk-release v${ZBR_VERSION}

Usage: npx zx-bulk-release [options]

Modes:
  (no flags)              All-in-one: analyze, build, test, pack, deliver
  --receive               Analyze & preflight. Writes .zbr-context.json. Run BEFORE deps install.
  --pack [dir]            Build, test, pack tars to dir.                          [default: parcels]
  --verify [dir]          Validate parcels against context, copy to parcels/.     [default: parcels]
  --deliver [dir]         Deliver parcels through channels.                       [default: parcels]

Options:
  --context <path>        Path to .zbr-context.json (with --verify).     [default: .zbr-context.json]
  --dry-run, --no-publish Disable any publish / remote-mutating logic.
  --no-build              Skip buildCmd.
  --no-test               Skip testCmd.
  --snapshot              Publish snapshot versions to npm only.
  --ignore <a,b>          Packages to ignore.
  --include-private       Include private packages.
  --concurrency <n>       Build/publish thread limit.                        [default: os.cpus().length]
  --only-workspace-deps   Recognize only workspace: deps as graph edges.
  --no-npm-fetch          Disable npm artifact fetching.
  --report <path>         Persist release state to file.
  --debug                 Enable verbose mode.
  -v, --version           Print version.
  -h, --help              Show this help.
`.trim()

export const run = async ({cwd = process.cwd(), env: _env, flags = {}} = {}) => within(async () => {
  if (flags.h || flags.help)
    return console.log(HELP)

  if (flags.v || flags.version)
    return console.log(ZBR_VERSION)

  const env = {...process.env, ..._env}
  log.secret(env.GH_TOKEN, env.GITHUB_TOKEN, env.NPM_TOKEN)
  log.info(`zx-bulk-release@${ZBR_VERSION}`)

  if (flags.verify)  return runVerify({cwd, flags})
  if (flags.deliver) return runDeliver({env, flags})

  const ctx = await createContext({flags, env, cwd})
  if (flags.receive) return runReceive({cwd, env, flags}, ctx)
  return runPack({cwd, env, flags}, ctx)
})

export const createContext = async ({flags, env, cwd}) => {
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
