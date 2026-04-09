// Meta publisher: pushes meta artifacts to the `meta` branch and undoes them on rollback.
// The meta payload itself is built by the generator (../generators/meta.js).

import {queuefy} from 'queuefy'
import {fs, path} from 'zx-extra'
import {log} from '../log.js'
import {fetchRepo, pushCommit} from '../api/git.js'
import {formatTag} from '../generators/tag.js'
import {prepareMeta, getArtifactPath, isAssetMode} from '../generators/meta.js'

// Push the meta artifact to the `meta` branch. No-op in asset mode (handled by gh-release).
const pushMetaBranch = queuefy(async (pkg) => {
  const {type} = pkg.config.meta
  if (type === null || isAssetMode(type)) return

  log.info('push artifact to branch \'meta\'')

  const {name, version, meta, tag = formatTag({name, version}), absPath: cwd, config: {gitCommitterEmail, gitCommitterName, ghBasicAuth: basicAuth}} = pkg
  const msg = `chore: release meta ${name} ${version}`
  const files = [{relpath: `${getArtifactPath(tag)}.json`, contents: meta}]

  await pushCommit({cwd, to: '.', branch: 'meta', msg, files, gitCommitterEmail, gitCommitterName, basicAuth})
})

// Remove a meta artifact for a given tag from the meta branch.
// Returns true if something was removed and pushed.
const removeMetaArtifact = async (pkg, {tag, version, reason}) => {
  const {config: {meta: {type}, ghBasicAuth: basicAuth, gitCommitterName, gitCommitterEmail}} = pkg
  // Asset-mode meta lives inside the GH release; deleting the release already removes it.
  if (type === null || isAssetMode(type)) return false

  const cwd = pkg.ctx?.git?.root || pkg.absPath
  const metaCwd = await fetchRepo({cwd, branch: 'meta', basicAuth})
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
    await pushCommit({cwd, branch: 'meta', msg: `chore: ${reason} ${pkg.name} ${version}`, gitCommitterName, gitCommitterEmail, basicAuth})
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
