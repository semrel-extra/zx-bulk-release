// The delivery rules, and the only place they live:
// - claim before act: nothing else of a package goes out until its claim is released;
// - settle before deciding: a stage waits for all its parcels, and the traversal never throws.

import {$, fs, tempy, within} from 'zx-extra'
import {unpackTar} from '../tar.js'
import {log} from '../log.js'
import {queuefy} from '../../util.js'
import {traverseQueue} from '../depot/deps.js'
import {STAGES} from './channels/index.js'

// Delivers the plan; returns the errors, if any, once everything has settled.
// A dry run walks the same rules and touches nothing.
export const execute = async (plan, {gitRoot, dryRun = false, concurrency = Infinity}) => {
  const run = {gitRoot, dryRun, outcomes: new Map(), errors: [], stopped: false}
  const cb = queuefy(async (key) => run.outcomes.set(key, await settlePkg(key, plan, run)), concurrency)
  await traverseQueue({queue: plan.queue, prev: plan.prev, cb})
  return run.errors
}

const settlePkg = async (key, plan, run) => {
  const parcels = plan.packages[key]
  const blocked = blockOf(plan.deps.get(key), run)
  if (blocked) return hold(key, parcels, ...blocked)

  for (const stage of STAGES) {
    const states = await Promise.all(parcels.filter(p => p.stage === stage).map(p => settleParcel(p, run)))
    const verdict = verdictOf(stage, states)
    if (verdict) return hold(key, parcels, ...verdict)
  }
  return 'done'
}

// An upstream conflict waits for the rebuild; an upstream hold, or an error anywhere, for a re-run.
const blockOf = (deps = [], {outcomes, stopped}) => {
  const upstream = deps.filter(d => outcomes.has(d) && outcomes.get(d) !== 'done')
  if (upstream.some(d => outcomes.get(d) === 'conflict')) return ['conflict']
  if (upstream.length) return ['held', `${upstream.join(', ')} not delivered`]
  return stopped ? ['held', 'stopped by an error'] : null
}

// A lost or failed parcel stops its package, and nothing else of it goes out while its claim isn't released.
const verdictOf = (stage, states) => {
  if (states.includes('conflict')) return ['conflict']
  if (states.includes('failed')) return ['held', 'a parcel failed']
  if (stage === 'claim' && states.some(s => s !== 'released')) return ['held', 'its claim is not released']
  return null
}

// Never throws: the error is kept for the end, and packages that have not started yet are held.
const settleParcel = async (p, run) => {
  if (p.state !== 'ready') return p.state
  try {
    p.result = await (run.dryRun ? 'ok' : runParcel(p, run)) === 'conflict' ? 'conflict' : 'released'
  } catch (e) {
    run.errors.push(e)
    run.stopped = true
    p.result = 'failed'
  }
  return p.result
}

// A lost claim, own or upstream, leaves the version to the rebuild: every parcel still there is marked conflict.
// Otherwise whatever this run could deliver waits for the next one, untouched.
const hold = (key, parcels, verdict, why) => {
  const open = parcels.filter(verdict === 'conflict' ? unsettled : waiting)
  for (const p of open) p.result = verdict
  if (why && open.length) log.warn(`holding ${key}: ${why}`)
  return verdict
}

const unsettled = (p) => !p.result && p.tarPath && p.state !== 'released' && p.state !== 'dropped'

const waiting = (p) => !p.result && p.state === 'ready'

const runParcel = ({tarPath, ch, resolved}, {gitRoot}) => within(async () => {
  $.scope = resolved.name || resolved.channel
  const {dir} = await unpackTar(tarPath, tempy.temporaryDirectory())
  const res = await ch.run(resolved, dir, {gitRoot})
  log.info(`${resolved.channel} ${resolved.version}`)
  return res
})

// Settled parcels are replaced by markers; held, invalid and failed ones stay for a re-run.
export const mark = async (plan) => {
  for (const p of Object.values(plan.packages).flat())
    if (p.result === 'released' || p.result === 'conflict') await fs.writeFile(p.tarPath, p.result)
}
