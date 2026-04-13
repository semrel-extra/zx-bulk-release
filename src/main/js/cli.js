#!/usr/bin/env node

import {argv} from 'zx-extra'
import {run, version} from './index.js'
import {normalizeFlags} from './config.js'

const flags = normalizeFlags(argv)

if (flags.h || flags.help) {
  console.log(`zx-bulk-release v${version}

Usage: npx zx-bulk-release [options]

Modes:
  (no flags)              All-in-one: analyze, build, test, pack, deliver
  --receive               Analyze & preflight, write zbr-context.json. Run BEFORE deps install
  --pack [dir]            Build, test, pack tars to dir                           [default: parcels]
  --verify [in:out]       Validate parcels against context, copy to out dir         [default: parcels]
  --deliver [dir]         Deliver parcels through channels                        [default: parcels]

Options:
  --context <path>        Trusted context path (with --verify)           [default: zbr-context.json]
  --dry-run, --no-publish Disable publish and any remote-mutating operations
  --no-build              Skip buildCmd
  --no-test               Skip testCmd
  --snapshot              Publish snapshot versions to npm only
  --ignore <a,b>          Packages to ignore
  --include-private       Include private packages
  --concurrency <n>       Build/publish thread limit                      [default: os.cpus().length]
  --only-workspace-deps   Recognize only workspace: deps as graph edges
  --no-npm-fetch          Disable npm artifact fetching
  --report <path>         Persist release state to file
  --debug                 Enable verbose mode
  -v, --version           Print version
  -h, --help              Show this help`)
  process.exit(0)
}

if (flags.v || flags.version) {
  console.log(version)
  process.exit(0)
}

try {
  await run({flags})
  process.exit(0)
} catch (e) {
  if (e?.exitCode !== undefined) process.exit(e.exitCode)
  console.error(e)
  process.exit(1)
}
