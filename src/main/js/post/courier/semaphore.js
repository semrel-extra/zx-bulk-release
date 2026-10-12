import {api} from '../api/index.js'

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
    await api.git.pushAnnotatedTag(cwd, tag, body)
    return true
  } catch {
    return false
  }
}

export const unlock = async (cwd, directive) => {
  await api.git.deleteRemoteTag(cwd, tagName(directive))
}

export const signalRebuild = async (cwd, sha) => {
  const tag = `zbr-rebuild.${sha.slice(0, 7)}`
  try { await api.git.pushAnnotatedTag(cwd, tag, 'rebuild') } catch { /* already signaled */ }
}

export const consumeRebuildSignal = async (cwd, sha) =>
  api.git.deleteRemoteTag(cwd, `zbr-rebuild.${sha.slice(0, 7)}`)
