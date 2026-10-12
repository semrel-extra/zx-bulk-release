import {api} from '../../api/index.js'
import {log} from '../../log.js'
import {hasHigherVersion} from '../seniority.js'

const run = async (manifest, dir) => {
  const {name, version, releaseNotes, branch, file, msg, repoAuthedUrl, gitCommitterEmail, gitCommitterName, ghBasicAuth} = manifest

  if (await hasHigherVersion(dir, name, version)) {
    log.warn(`skipping changelog for ${name}@${version}: higher version already released`)
    return 'ok'
  }

  log.info('push changelog')

  await api.git.pushCommit({
    branch,
    msg,
    files: [{relpath: file, contents: (prev) => prev.includes(releaseNotes) ? prev : releaseNotes + '\n' + prev}],
    origin: repoAuthedUrl,
    gitCommitterEmail,
    gitCommitterName,
    basicAuth: ghBasicAuth,
  })
  return 'ok'
}

export default {
  name: 'changelog',
  requires: ['repoAuthedUrl'],
  when: (pkg) => !!pkg.config.changelog,
  run,
}
