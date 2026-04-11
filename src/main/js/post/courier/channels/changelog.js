import {$} from 'zx-extra'
import {queuefy} from 'queuefy'
import {fetchRepo, pushCommit} from '../../api/git.js'
import {log} from '../../log.js'

const run = queuefy(async (manifest, dir) => {
  const {releaseNotes, branch, file, msg, repoAuthedUrl, gitCommitterEmail, gitCommitterName, ghBasicAuth} = manifest

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
})

export default {
  name: 'changelog',
  when: (pkg) => !!pkg.config.changelog,
  run,
}
