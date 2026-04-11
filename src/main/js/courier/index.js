// Courier: sealed delivery of release artifacts.
//
// Owns the full publisher registry. Processor references publishers by name,
// never by direct import — courier is the single place that knows how to
// resolve a name like 'npm' or 'gh-release' into runnable code.
//
// deliver() handles transport-only publishers (no user code).
// cmd is in the registry (teardown/filtering may need it) but deliver() skips it.

import {log} from '../processor/log.js'
import gitTag from './publishers/git-tag.js'
import meta from './publishers/meta.js'
import npm from './publishers/npm.js'
import ghRelease from './publishers/gh-release.js'
import ghPages from './publishers/gh-pages.js'
import changelog from './publishers/changelog.js'
import cmd from './publishers/cmd.js'

export {buildDirective} from './directive.js'

// Full publisher registry, keyed by name.
export const publishers = {'git-tag': gitTag, meta, npm, 'gh-release': ghRelease, 'gh-pages': ghPages, changelog, cmd}

// Default publisher order. Processor passes this into ctx.
export const defaultOrder = ['git-tag', 'meta', 'npm', 'gh-release', 'gh-pages', 'changelog', 'cmd']

// Which of `names` are active for this pkg + snapshot combo.
export const filterActive = (names, pkg, {snapshot = false} = {}) =>
  names.filter(n => {
    const p = publishers[n]
    return p && (!snapshot || p.snapshot) && p.when(pkg)
  })

// Run prepare phase for named publishers (serial — order matters).
export const prepare = async (names, pkg) => {
  for (const n of names) await publishers[n]?.prepare?.(pkg)
}

// Run a single publisher by name. Extra args forwarded (cmd needs exec).
export const runPublisher = async (name, ...args) => publishers[name]?.run(...args)

// Undo publishers in reverse order (for teardown).
export const undo = async (names, pkg, opts) => {
  for (const n of [...names].reverse()) {
    const p = publishers[n]
    if (!p?.undo || !p.when(pkg)) continue
    try {
      const result = await p.undo(pkg, opts)
      if (result !== false) log.info(`${opts.reason}: ${p.name} undone for '${opts.tag}'`)
    } catch (e) {
      log.warn(`${opts.reason}: ${p.name} undo failed`, e)
    }
  }
}

// Deliver using a sealed directive. Transport-only — cmd is excluded.
// Each publisher receives a single self-contained data envelope.
// git-tag runs first (other publishers may reference the tag), then the rest in parallel.
export const deliver = async (directive) => {
  const entries = Object.entries(directive.publishers).filter(([n]) => n !== 'cmd')

  const tag = entries.find(([n]) => n === 'git-tag')
  if (tag) await publishers['git-tag'].run(tag[1])

  await Promise.all(
    entries
      .filter(([n]) => n !== 'git-tag')
      .map(([name, data]) => publishers[name]?.run(data))
  )
}
