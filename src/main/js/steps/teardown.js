// Release teardown: undo a published (or half-published) release.
//
// Two entry points share the same core:
//   - rollbackRelease: called inline from publish.js on mid-publish failure (tag known from pkg.context).
//   - recover:         standalone --recover mode — detect orphan tags (tagged but missing on npm) and tear them down.
//
// Teardown walks the publishers registry in reverse and calls undo() on each that applies.

import {log} from '../log.js'
import {deleteRemoteTag, getRoot} from '../api/git.js'
import {fetchManifest} from '../api/npm.js'
import {isNpmPublished, publishers} from './publishers.js'

export {isNpmPublished}

// Tear down a release: undo every applicable publisher, then delete the git tag.
// Failures in individual undo steps are warned, not thrown — teardown is best-effort.
const teardownRelease = async (pkg, {tag, version, reason}) => {
  const cwd = await getRoot(pkg.absPath)
  if (!pkg.config.ghBasicAuth) throw new Error(`${reason} requires git credentials (GH_TOKEN)`)

  for (const p of [...publishers].reverse()) {
    if (!p.undo || !p.when(pkg)) continue
    try {
      const result = await p.undo(pkg, {tag, version, reason})
      if (result !== false) log({pkg})(`${reason}: ${p.name} undone for '${tag}'`)
    } catch (e) {
      log({pkg, level: 'warn'})(`${reason}: ${p.name} undo failed`, e)
    }
  }

  await deleteRemoteTag({cwd, tag})
}

// Rollback a release that failed mid-publish (called inline from publish.js).
// Uses the current release tag; skips the npm existence check — we already know it failed.
export const rollbackRelease = async (pkg) => {
  const tag = pkg.context.git.tag
  if (!tag) return
  log({pkg})(`rollback: cleaning up failed release for tag '${tag}'`)
  await teardownRelease(pkg, {tag, version: pkg.version, reason: 'rollback'})
}

// Standalone recovery: if a tag exists but the package is missing from npm, treat it as an orphan and tear down.
export const recover = async (pkg) => {
  if (!isNpmPublished(pkg)) return false

  const {tag} = pkg.latest
  if (!tag) return false

  const manifest = await fetchManifest({
    name: pkg.name,
    version: tag.version,
    config: pkg.config,
  }, {nothrow: true})
  if (manifest) return false

  log({pkg})(`recover: tag '${tag.ref}' exists but ${pkg.name}@${tag.version} not found on npm, rolling back failed release`)
  await teardownRelease(pkg, {tag: tag.ref, version: tag.version, reason: 'recover'})
  return true
}
