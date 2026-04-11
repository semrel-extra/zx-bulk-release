import {log} from '../../processor/log.js'
import {pushTag, deleteRemoteTag} from '../../processor/api/git.js'

const run = async (data) => {
  const {tag, gitRoot: cwd, gitCommitterEmail, gitCommitterName} = data
  log.info(`push release tag ${tag}`)
  await pushTag({cwd, tag, gitCommitterEmail, gitCommitterName})
}

// undo is called from teardown with (pkg, {tag, version, reason})
const undo = async (pkg, {tag}) => {
  const cwd = pkg.gitRoot || pkg.ctx?.git?.root || pkg.absPath
  await deleteRemoteTag({cwd, tag})
}

export default {
  name: 'git-tag',
  when: () => true,
  run,
  undo,
}
