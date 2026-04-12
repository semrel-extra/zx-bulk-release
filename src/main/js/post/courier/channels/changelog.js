import {$} from 'zx-extra'
import {queuefy} from 'queuefy'
import {fetchRepo, pushCommit} from '../../api/git.js'
import {log} from '../../log.js'
import {hasHigherVersion} from '../seniority.js'

const run = queuefy(async (manifest, dir) => {
  const {name, version, releaseNotes, branch, file, msg, repoAuthedUrl, gitCommitterEmail, gitCommitterName, ghBasicAuth} = manifest

  if (await hasHigherVersion(dir, name, version)) {
    log.warn(`skipping changelog for ${name}@${version}: higher version already released`)
    return 'ok'
  }

  log.info('push changelog')

  const _cwd = await fetchRepo({branch, origin: repoAuthedUrl, basicAuth: ghBasicAuth})

  await $({cwd: _cwd})`echo ${releaseNotes}"\n$(cat ./${file})" > ./${file}`
  await pushCommit({
    branch,
    msg,
    origin: repoAuthedUrl,
    gitCommitterEmail,
    gitCommitterName,
    basicAuth: ghBasicAuth,
  })
  return 'ok'
})

export default {
  name: 'changelog',
  requires: ['repoAuthedUrl'],
  when: (pkg) => !!pkg.config.changelog,
  run,
}
