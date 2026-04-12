import {path} from 'zx-extra'
import {queuefy} from 'queuefy'
import {log} from '../../log.js'
import {pushCommit} from '../../api/git.js'
import {hasHigherVersion} from '../seniority.js'

const run = queuefy(async (manifest, dir) => {
  const {name, version, branch, to, msg, repoAuthedUrl, gitCommitterEmail, gitCommitterName, ghBasicAuth} = manifest
  const docsDir = path.join(dir, 'docs')

  if (await hasHigherVersion(docsDir, name, version)) {
    log.warn(`skipping gh-pages for ${name}@${version}: higher version already released`)
    return 'ok'
  }

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
  return 'ok'
})

export default {
  name: 'gh-pages',
  requires: ['repoAuthedUrl'],
  when: (pkg) => !!pkg.config.ghPages,
  run,
}
