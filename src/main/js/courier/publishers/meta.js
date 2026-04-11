// Meta publisher: pushes meta artifacts to the `meta` branch and undoes them on rollback.

import {queuefy} from 'queuefy'
import {fs, path} from 'zx-extra'
import {log} from '../../processor/log.js'
import {fetchRepo, pushCommit} from '../../processor/api/git.js'
import {getArtifactPath, isAssetMode} from '../../processor/generators/meta.js'
import {prepareMeta} from '../../processor/generators/meta.js'

const pushMetaBranch = queuefy(async (data) => {
  const {name, version, tag, type, data: meta, gitRoot, repoAuthedUrl, gitCommitterEmail, gitCommitterName, ghBasicAuth} = data
  if (type === null || isAssetMode(type)) return

  log.info('push artifact to branch \'meta\'')

  const msg = `chore: release meta ${name} ${version}`
  const files = [{relpath: `${getArtifactPath(tag)}.json`, contents: meta}]

  await pushCommit({
    cwd: gitRoot,
    to: '.',
    branch: 'meta',
    msg,
    files,
    origin: repoAuthedUrl,
    gitCommitterEmail,
    gitCommitterName,
    basicAuth: ghBasicAuth,
  })
})

const removeMetaArtifact = async (pkg, {tag, version, reason}) => {
  const {config: {meta: {type}, ghBasicAuth: basicAuth, gitCommitterName, gitCommitterEmail}} = pkg
  if (type === null || isAssetMode(type)) return false

  const cwd = pkg.gitRoot || pkg.ctx?.git?.root || pkg.absPath
  const metaCwd = await fetchRepo({cwd, branch: 'meta', origin: pkg.repoAuthedUrl, basicAuth})
  const artifactPath = getArtifactPath(tag)
  const candidates = [
    path.resolve(metaCwd, `${artifactPath}.json`),
    path.resolve(metaCwd, artifactPath),
  ]
  let removed = false
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      await fs.remove(p)
      removed = true
    }
  }
  if (removed) {
    await pushCommit({cwd, branch: 'meta', msg: `chore: ${reason} ${pkg.name} ${version}`, origin: pkg.repoAuthedUrl, gitCommitterName, gitCommitterEmail, basicAuth})
  }
  return removed
}

export default {
  name: 'meta',
  when:    (pkg) => pkg.config.meta.type !== null,
  prepare: prepareMeta,
  run:     pushMetaBranch,
  undo:    removeMetaArtifact,
}
