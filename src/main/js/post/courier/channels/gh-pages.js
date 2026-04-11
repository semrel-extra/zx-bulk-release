import {path} from 'zx-extra'
import {queuefy} from 'queuefy'
import {log} from '../../log.js'
import {pushCommit} from '../../api/git.js'

const run = queuefy(async (manifest, dir) => {
  const {branch, to, msg, repoAuthedUrl, gitCommitterEmail, gitCommitterName, ghBasicAuth} = manifest
  const docsDir = path.join(dir, 'docs')

  log.info(`publish docs to ${branch}`)

  await pushCommit({
    cwd: docsDir,
    from: '.',
    to,
    branch,
    origin: repoAuthedUrl,
    msg,
    gitCommitterEmail,
    gitCommitterName,
    basicAuth: ghBasicAuth,
  })
})

export default {
  name: 'gh-pages',
  requires: ['repoAuthedUrl'],
  when: (pkg) => !!pkg.config.ghPages,
  run,
}
