import {queuefy} from 'queuefy'
import {log} from '../../processor/log.js'
import {pushCommit} from '../../processor/api/git.js'

const run = queuefy(async (data) => {
  const {docsDir, branch, to, msg, repoAuthedUrl, gitCommitterEmail, gitCommitterName, ghBasicAuth} = data

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
  when: (pkg) => !!pkg.config.ghPages,
  run,
}
