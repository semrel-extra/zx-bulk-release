// Release teardown: undo a published (or half-published) release.
//
// Two entry points share the same core:
//   - rollbackRelease: called inline from publish.js on mid-publish failure (tag known from pkg.ctx).
//   - recover:         standalone --recover mode — detect orphan tags (tagged but missing on npm) and tear them down.
//
// Teardown delegates to courier's undo(), which walks the publishers in reverse.
// git-tag is a regular publisher, so its undo (deleteRemoteTag) runs as part of the reverse walk.

import {log} from '../log.js'
import {fetchManifest} from '../api/npm.js'
import {isNpmPublished} from '../../courier/publishers/npm.js'
import {undo} from '../../courier/index.js'

// Tear down a release: undo every applicable publisher (including git-tag) in reverse.
// Failures in individual undo steps are warned, not thrown — teardown is best-effort.
const teardownRelease = async (pkg, ctx, {tag, version, reason}) => {
  if (!pkg.config.ghBasicAuth) throw new Error(`${reason} requires git credentials (GH_TOKEN)`)

  await undo(ctx.publishers, pkg, {tag, version, reason})
}

// Rollback a release that failed mid-publish (called inline from publish.js).
export const rollbackRelease = async (pkg, ctx = pkg.ctx) => {
  const tag = ctx.git.tag
  if (!tag) return
  log.info(`rollback: cleaning up failed release for tag '${tag}'`)
  await teardownRelease(pkg, ctx, {tag, version: pkg.version, reason: 'rollback'})
}

// Standalone recovery: if a tag exists but the package is missing from npm, treat it as an orphan and tear down.
export const recover = async (pkg, ctx = pkg.ctx) => {
  if (!isNpmPublished(pkg)) return false

  const {tag} = pkg.latest
  if (!tag) return false

  const manifest = await fetchManifest({
    name: pkg.name,
    version: tag.version,
    config: pkg.config,
  }, {nothrow: true})
  if (manifest) return false

  log.info(`recover: tag '${tag.ref}' exists but ${pkg.name}@${tag.version} not found on npm, rolling back failed release`)
  await teardownRelease(pkg, ctx, {tag: tag.ref, version: tag.version, reason: 'recover'})
  return true
}
