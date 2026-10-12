import {randomUUID} from 'node:crypto'
import {api} from '../api/index.js'
import {log} from '../log.js'

// Lock and rebuild tags point at the release commit, the one the directive delivers.
const lockTag    = (sha) => `zbr-deliver.${sha.slice(0, 7)}`
const rebuildTag = (sha) => `zbr-rebuild.${sha.slice(0, 7)}`

// The holder makes each lock tag unique: identical tag objects from two runners would both push fine.
export const tryLock = async (cwd, directive) => {
  const message = JSON.stringify({
    ts:       directive.timestamp,
    sha:      directive.sha,
    packages: directive.queue,
    holder:   randomUUID(),
  })
  return (await api.git.pushTag({cwd, tag: lockTag(directive.sha), sha: directive.sha, message})).pushed
}

export const unlock = async (cwd, directive) => {
  const res = await api.git.deleteRemoteTag(cwd, lockTag(directive.sha))
  if (res.exitCode !== 0) log.warn(`failed to remove ${lockTag(directive.sha)}, delete it by hand`, res)
}

// An existing tag means the rebuild is already signalled.
export const signalRebuild = async (cwd, sha) => {
  await api.git.pushTag({cwd, tag: rebuildTag(sha), sha, message: 'rebuild'})
}

export const consumeRebuildSignal = async (cwd, sha) =>
  api.git.deleteRemoteTag(cwd, rebuildTag(sha))
