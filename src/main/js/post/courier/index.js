// Courier: sealed delivery of release artifacts.
//
// Owns the full channel registry. Depot references channels by name,
// never by direct import — courier is the single place that knows how to
// resolve a name like 'npm' or 'gh-release' into runnable code.
//
// deliver() handles transport-only channels (no user code).
// cmd is in the registry (teardown/filtering may need it) but deliver() skips it.

import {log} from '../log.js'
import gitTag from './channels/git-tag.js'
import meta from './channels/meta.js'
import npm from './channels/npm.js'
import ghRelease from './channels/gh-release.js'
import ghPages from './channels/gh-pages.js'
import changelog from './channels/changelog.js'
import cmd from './channels/cmd.js'

export {buildParcel} from './parcel.js'

// Full channel registry, keyed by name.
export const channels = {'git-tag': gitTag, meta, npm, 'gh-release': ghRelease, 'gh-pages': ghPages, changelog, cmd}

// Default channel order. Depot passes this into ctx.
export const defaultOrder = ['git-tag', 'meta', 'npm', 'gh-release', 'gh-pages', 'changelog', 'cmd']

// Which of `names` are active for this pkg + snapshot combo.
export const filterActive = (names, pkg, {snapshot = false} = {}) =>
  names.filter(n => {
    const ch = channels[n]
    return ch && (!snapshot || ch.snapshot) && ch.when(pkg)
  })

// Run prepare phase for named channels (serial — order matters).
export const prepare = async (names, pkg) => {
  for (const n of names) await channels[n]?.prepare?.(pkg)
}

// Run a single channel by name. Extra args forwarded (cmd needs exec).
export const runChannel = async (name, ...args) => channels[name]?.run(...args)

// Undo channels in reverse order (for teardown).
export const undo = async (names, pkg, opts) => {
  for (const n of [...names].reverse()) {
    const ch = channels[n]
    if (!ch?.undo || !ch.when(pkg)) continue
    try {
      const result = await ch.undo(pkg, opts)
      if (result !== false) log.info(`${opts.reason}: ${ch.name} undone for '${opts.tag}'`)
    } catch (e) {
      log.warn(`${opts.reason}: ${ch.name} undo failed`, e)
    }
  }
}

// Deliver a sealed parcel. Transport-only — cmd is excluded.
// Each channel receives a single self-contained data envelope.
// git-tag runs first (other channels may reference the tag), then the rest in parallel.
export const deliver = async (parcel) => {
  const entries = Object.entries(parcel.channels).filter(([n]) => n !== 'cmd')

  const tag = entries.find(([n]) => n === 'git-tag')
  if (tag) await channels['git-tag'].run(tag[1])

  await Promise.all(
    entries
      .filter(([n]) => n !== 'git-tag')
      .map(([name, data]) => channels[name]?.run(data))
  )
}
