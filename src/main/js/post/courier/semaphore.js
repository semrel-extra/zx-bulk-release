import {$} from 'zx-extra'
import {api} from '../api/index.js'
import {DEFAULT_GIT_COMMITTER_NAME, DEFAULT_GIT_COMMITTER_EMAIL} from '../api/git.js'

const tagName = ({sha}) =>
  `zbr-deliver.${sha.slice(0, 7)}`

const ensureHead = async (cwd) => {
  try { await $({cwd, quiet: true})`git rev-parse HEAD` } catch {
    await api.git.setUserConfig(cwd, DEFAULT_GIT_COMMITTER_NAME, DEFAULT_GIT_COMMITTER_EMAIL)
    await $({cwd, quiet: true})`git commit --allow-empty -m init`
  }
}

export const tryLock = async (cwd, directive) => {
  const tag = tagName(directive)
  const body = JSON.stringify({
    ts:       directive.timestamp,
    sha:      directive.sha,
    packages: directive.queue,
  })
  try {
    await ensureHead(cwd)
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
