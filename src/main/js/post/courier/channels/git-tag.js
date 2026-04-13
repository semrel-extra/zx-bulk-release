import {$} from 'zx-extra'
import {api} from '../../api/index.js'
import {DEFAULT_GIT_COMMITTER_NAME, DEFAULT_GIT_COMMITTER_EMAIL} from '../../api/git.js'

export const isTagConflict = (e) =>
  /already exists|updates were rejected|failed to push/i.test(e?.message || e?.stderr || '')

const ensureSha = async (cwd, sha) => {
  if (!sha) return
  const check = await $({cwd, nothrow: true, quiet: true})`git cat-file -e ${sha}`
  if (check.exitCode !== 0) {
    await $({cwd, quiet: true})`git fetch origin --depth 1`
  }
}

const run = async (manifest, dir) => {
  const {tag, sha, cwd} = manifest
  const gitCommitterName  = manifest.gitCommitterName  || DEFAULT_GIT_COMMITTER_NAME
  const gitCommitterEmail = manifest.gitCommitterEmail || DEFAULT_GIT_COMMITTER_EMAIL
  try {
    await ensureSha(cwd, sha)
    await api.git.pushTag({cwd, tag, sha, gitCommitterName, gitCommitterEmail})
    return 'ok'
  } catch (e) {
    if (isTagConflict(e)) return 'conflict'
    throw e
  }
}

export default {
  name: 'git-tag',
  requires: ['tag', 'cwd'],
  when: (pkg) => !pkg.ctx?.flags?.snapshot,
  run,
}
