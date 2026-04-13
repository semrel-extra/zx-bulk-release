import {fs, path} from 'zx-extra'
import {queuefy} from '../../../util.js'
import {api} from '../../api/index.js'
import {log} from '../../log.js'
import {hasHigherVersion} from '../seniority.js'

const run = queuefy(async (manifest, dir) => {
  const {name, version, releaseNotes, branch, file, msg, repoAuthedUrl, gitCommitterEmail, gitCommitterName, ghBasicAuth} = manifest

  if (await hasHigherVersion(dir, name, version)) {
    log.warn(`skipping changelog for ${name}@${version}: higher version already released`)
    return 'ok'
  }

  log.info('push changelog')

  const _cwd = await api.git.fetchRepo({branch, origin: repoAuthedUrl, basicAuth: ghBasicAuth})
  const filePath = path.resolve(_cwd, file)
  const prev = await fs.readFile(filePath, 'utf8').catch(() => '')
  await fs.outputFile(filePath, releaseNotes + '\n' + prev)

  await api.git.pushCommit({
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
