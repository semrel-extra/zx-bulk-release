import {pushTag} from '../../api/git.js'
import {DEFAULT_GIT_COMMITTER_NAME, DEFAULT_GIT_COMMITTER_EMAIL} from '../../api/git.js'

const run = async (manifest) => {
  const {tag, cwd} = manifest
  const gitCommitterName  = manifest.gitCommitterName  || DEFAULT_GIT_COMMITTER_NAME
  const gitCommitterEmail = manifest.gitCommitterEmail || DEFAULT_GIT_COMMITTER_EMAIL
  await pushTag({cwd, tag, gitCommitterName, gitCommitterEmail})
}

export default {
  name: 'git-tag',
  requires: ['tag', 'cwd'],
  when: (pkg) => !pkg.ctx?.flags?.snapshot,
  run,
}
