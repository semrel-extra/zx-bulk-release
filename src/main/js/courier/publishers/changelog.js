import {$} from 'zx-extra'
import {queuefy} from 'queuefy'
import {fetchRepo, pushCommit} from '../../processor/api/git.js'
import {log} from '../../processor/log.js'

const run = queuefy(async (data) => {
  const {releaseNotes, branch, file, msg, gitRoot, repoAuthedUrl, gitCommitterEmail, gitCommitterName, ghBasicAuth} = data

  log.info('push changelog')

  const _cwd = await fetchRepo({cwd: gitRoot, branch, origin: repoAuthedUrl, basicAuth: ghBasicAuth})

  await $({cwd: _cwd})`echo ${releaseNotes}"\n$(cat ./${file})" > ./${file}`
  await pushCommit({
    cwd: gitRoot,
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
