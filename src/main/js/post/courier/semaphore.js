import {pushAnnotatedTag, deleteRemoteTag} from '../api/git.js'

const tagName = ({sha}) =>
  `zbr-deliver.${sha.slice(0, 7)}`

export const tryLock = async (cwd, directive) => {
  const tag = tagName(directive)
  const body = JSON.stringify({
    ts:       directive.timestamp,
    sha:      directive.sha,
    packages: directive.queue,
  })
  try {
    await pushAnnotatedTag(cwd, tag, body)
    return true
  } catch {
    return false
  }
}

export const unlock = async (cwd, directive) => {
  await deleteRemoteTag(cwd, tagName(directive))
}

export const signalRebuild = async (cwd, sha) => {
  const tag = `zbr-rebuild.${sha.slice(0, 7)}`
  try { await pushAnnotatedTag(cwd, tag, 'rebuild') } catch { /* already signaled */ }
}

export const consumeRebuildSignal = async (cwd, sha) =>
  deleteRemoteTag(cwd, `zbr-rebuild.${sha.slice(0, 7)}`)
