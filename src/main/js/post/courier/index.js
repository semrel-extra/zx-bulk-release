import {path, fs} from 'zx-extra'
import {log} from '../log.js'
import {api} from '../api/index.js'
import {throwAll} from '../../util.js'
import {scanDirectives, invalidateOrphans, parcelChannel} from '../parcel/directive.js'
import {tryLock, unlock, signalRebuild} from './semaphore.js'
import {channels, defaultOrder} from './channels/index.js'
import {ghAuth, openAll, planOf, looseOf, warnSkipped} from './plan.js'
import {execute, mark} from './execute.js'

export {channels, defaultOrder}
export {resolveManifest} from './plan.js'

export const getActiveChannels = (pkg, channelNames, snapshot) =>
  channelNames.filter(n => {
    const ch = channels[n]
    return ch && ch.transport !== false && (!snapshot || ch.snapshot) && ch.when(pkg)
  })

export const prepare = async (names, pkg) => {
  for (const n of names) await channels[n]?.prepare?.(pkg)
}

export const runChannel = async (name, ...args) => channels[name]?.run(...args)

// Where deliver pushes when it runs without a checkout.
const deliveryOrigin = (env) => {
  const server = env.GITHUB_SERVER_URL || 'https://github.com'
  const auth = ghAuth(env)
  return auth
    ? `https://${auth}@${new URL(server).host}/${env.GITHUB_REPOSITORY}.git`
    : `${server}/${env.GITHUB_REPOSITORY}.git`
}

// cwd: where to look for the repo to tag in; without a checkout deliver makes one bound to GITHUB_REPOSITORY.
// A directive is delivered under its lock; parcels without one (all-in-one) go by the same rules, unlocked.
export const deliver = async (tars, env = process.env, {dryRun = false, cwd} = {}) => {
  const dir = tars.length ? path.dirname(tars[0]) : null
  const directives = dir ? await scanDirectives(dir) : []
  const ctx = {env, dryRun, dir, tars, gitRoot: await api.git.openRepo(cwd, deliveryOrigin(env))}

  const results = []
  for (const directive of directives) results.push(await deliverDirective(directive, ctx))
  // Parcels of a directive that is marked done or lost wait for nothing: they never go out loose.
  if (!directives.length && !tars.some(t => parcelChannel(path.basename(t)) === 'directive')) results.push(await deliverLoose(ctx))
  return summary(tars.length, results.filter(Boolean))
}

const deliverDirective = async (directive, ctx) => {
  if (ctx.dryRun) return rehearse(await planDirective(directive, ctx), ctx)
  if (!await tryLock(ctx.gitRoot, directive)) return warnLocked(directive.sha.slice(0, 7))

  const {plan, errors} = await underLock(directive, ctx)
  const result = resultOf(plan)
  // A failed signal is one more error: the directive stays unmarked, so a re-run signals again.
  if (result.conflicts.length) await signalRebuild(ctx.gitRoot, directive.sha).catch(e => { errors.push(e) })
  await mark(plan)
  const marker = directiveMarker(Object.values(plan.packages).flat(), errors)
  if (marker) await fs.writeFile(directive.tarPath, marker)
  return settled(result, errors)
}

// Another delivery runs, or a dead one left its lock: zbr can't tell, and doesn't break locks.
const warnLocked = (sha7) =>
  log.warn(`skipping directive ${sha7}: zbr-deliver.${sha7} is on the remote. If no delivery is running, delete that tag`)

// Everything settles before the lock goes.
const underLock = async (directive, ctx) => {
  try {
    await invalidateOrphans(ctx.dir, directive)
    const plan = await planDirective(directive, ctx)
    return {plan, errors: await execute(plan, ctx)}
  } finally {
    await unlock(ctx.gitRoot, directive)
  }
}

// Only the parcels the directive lists: an earlier build's leftovers are orphans, not deliveries.
const planDirective = async (directive, ctx) => {
  const listed = new Set(Object.values(directive.packages || {}).flatMap(p => p.parcels || []))
  const opened = await openAll(ctx.tars.filter(t => listed.has(path.basename(t))), ctx.env)
  const plan = planOf(directive, opened)
  await confirmClaims(plan, directive, ctx)
  return warnSkipped(plan)
}

// A marker on a claim says where to look, the remote says what it is: our tag means released, another
// commit's means a conflict, no tag means the marker lies. So no marker from a pack opens or shuts a gate.
const confirmClaims = async (plan, directive, {gitRoot}) => {
  for (const [name, parcels] of Object.entries(plan.packages)) {
    const markers = parcels.filter(p => p.stage === 'claim' && (p.state === 'released' || p.state === 'conflict'))
    if (!markers.length) continue
    const tag = directive.packages[name].tag
    const commit = await api.git.getRemoteTagCommit(gitRoot, tag)
    const state = commit === directive.sha ? 'released' : commit ? 'conflict' : 'invalid'
    for (const p of markers) Object.assign(p, {state, ...state === 'invalid' && {reason: `marked ${p.state}, yet ${tag} is not on the remote`}})
  }
}

// Without a directive a parcel that names no package can't be gated by any claim, so nothing goes out.
// Nobody rebuilds such a delivery, so a lost claim fails the run. Up to 4 packages at a time, as in 3.x.
const deliverLoose = async (ctx) => {
  const opened = await openAll(ctx.tars, ctx.env)
  const plan = looseOf(opened)
  if (plan.unowned.length) throw new Error(`parcels of no package (unreadable, or no name@version): ${plan.unowned.join(', ')}`)

  warnSkipped(plan)
  if (ctx.dryRun) return rehearse(plan, ctx)

  const errors = await execute(plan, {...ctx, concurrency: 4})
  await mark(plan)
  const result = resultOf(plan)
  return settled(result, [...errors, ...result.conflicts.map(key => new Error(`${key}: the release tag belongs to another commit`))])
}

// The same rules with nothing delivered: what would go out, and what would be held.
const rehearse = async (plan, ctx) => {
  await execute(plan, ctx)
  return resultOf(plan, true)
}

// An error leaves the directive for a re-run, a conflict for the rebuild, a held parcel for another process.
const directiveMarker = (parcels, errors) => {
  if (errors.length) return null
  if (parcels.some(p => p.result === 'conflict')) return 'conflict'
  return parcels.every(p => p.result === 'released' || p.state === 'released' || p.state === 'dropped') ? 'released' : null
}

const resultOf = (plan, dryRun = false) => {
  const parcels = Object.values(plan.packages).flat()
  const done = parcels.filter(p => p.result === 'released')
  return {
    pending:   parcels.filter(p => p.state === 'ready').length,
    delivered: dryRun ? 0 : done.length,
    skipped:   parcels.filter(p => p.state === 'held' || p.state === 'invalid' || p.result === 'held').length,
    entries:   done.map(({resolved: {channel, name, version}}) => ({channel, name, version})),
    conflicts: Object.keys(plan.packages).filter(key => plan.packages[key].some(p => p.result === 'conflict')),
    invalid:   parcels.filter(p => p.state === 'invalid').map(({file, errors, reason}) => ({file, errors: errors || [reason]})),
  }
}

const summary = (total, results) => ({
  total,
  pending:   results.reduce((n, r) => n + r.pending, 0),
  delivered: results.reduce((n, r) => n + r.delivered, 0),
  skipped:   results.reduce((n, r) => n + r.skipped, 0),
  entries:   results.flatMap(r => r.entries),
  conflicts: results.flatMap(r => r.conflicts),
  invalid:   results.flatMap(r => r.invalid),
})

const settled = (result, errors) => {
  throwAll(errors, 'deliveries')
  return result
}
