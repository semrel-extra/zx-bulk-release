import {pushTag} from '../../api/git.js'
import {DEFAULT_GIT_COMMITTER_NAME, DEFAULT_GIT_COMMITTER_EMAIL} from '../../api/git.js'

export const isTagConflict = (e) =>
  /already exists|updates were rejected|failed to push/i.test(e?.message || e?.stderr || '')

const run = async (manifest) => {
  const {tag, cwd} = manifest
  const gitCommitterName  = manifest.gitCommitterName  || DEFAULT_GIT_COMMITTER_NAME
  const gitCommitterEmail = manifest.gitCommitterEmail || DEFAULT_GIT_COMMITTER_EMAIL
  try {
    await pushTag({cwd, tag, gitCommitterName, gitCommitterEmail})
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
