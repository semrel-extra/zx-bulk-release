import {api} from '../../api/index.js'

// The claim: whoever owns the tag owns the version. A tag at our commit is ours already (a re-run).
const run = async ({tag, sha, gitCommitterName, gitCommitterEmail}, dir, {gitRoot}) => {
  const {pushed, commit} = await api.git.pushTag({cwd: gitRoot, tag, sha, gitCommitterName, gitCommitterEmail})
  return pushed ? 'ok' : commit === sha ? 'duplicate' : 'conflict'
}

export default {
  name: 'git-tag',
  requires: ['tag', 'sha'],
  when: (pkg) => !pkg.ctx?.flags?.snapshot,
  run,
}
