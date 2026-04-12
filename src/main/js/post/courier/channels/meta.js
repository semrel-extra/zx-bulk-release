import {queuefy} from 'queuefy'
import {log} from '../../log.js'
import {pushCommit} from '../../api/git.js'
import {getArtifactPath, isAssetMode, prepareMeta} from '../../depot/generators/meta.js'
import {hasHigherVersion} from '../seniority.js'

const pushMetaBranch = queuefy(async (manifest, dir) => {
  const {name, version, tag, type, data: meta, repoAuthedUrl, gitCommitterEmail, gitCommitterName, ghBasicAuth} = manifest
  if (type === null || isAssetMode(type)) return 'ok'

  if (await hasHigherVersion(dir, name, version)) {
    log.warn(`skipping meta for ${name}@${version}: higher version already released`)
    return 'ok'
  }

  log.info('push artifact to branch \'meta\'')

  const msg = `chore: release meta ${name} ${version}`
  const files = [{relpath: `${getArtifactPath(tag)}.json`, contents: meta}]

  await pushCommit({
    to: '.',
    branch: 'meta',
    msg,
    files,
    origin: repoAuthedUrl,
    gitCommitterEmail,
    gitCommitterName,
    basicAuth: ghBasicAuth,
  })
  return 'ok'
})

export default {
  name: 'meta',
  requires: ['repoAuthedUrl'],
  when:    (pkg) => pkg.config.meta.type !== null,
  prepare: prepareMeta,
  run:     pushMetaBranch,
}
