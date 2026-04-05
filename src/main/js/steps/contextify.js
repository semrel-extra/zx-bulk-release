import {getPkgConfig} from '../config.js'
import {getLatest} from '../processor/meta.js'
import {getRoot, getSha, deleteRemoteTag} from '../api/git.js'
import {fetchManifest} from '../api/npm.js'
import {log} from '../log.js'
import {$} from 'zx-extra'

// Inspired by https://docs.github.com/en/actions/learn-github-actions/contexts
export const contextify = async (pkg, {packages, root, flags, env}) => {
  pkg.config = await getPkgConfig([pkg.absPath, root.absPath], env)
  pkg.latest = await getLatest(pkg)

  if (flags.recover && pkg.latest.tag) {
    await recover(pkg)
  }

  pkg.context = {
    git: {
      sha: await getSha(pkg.absPath),
      root: await getRoot(pkg.absPath)
    },
    env: $.env,
    flags,
    packages
  }
}

// Verify that the latest tagged version actually exists on npm.
// If not (tag was pushed but npm publish failed), delete the orphan tag
// so the next analyze phase can re-detect changes and retry the release.
const recover = async (pkg) => {
  const needsNpm = !pkg.manifest.private && pkg.config.npmPublish !== false
  if (!needsNpm) return

  const {tag} = pkg.latest
  const manifest = await fetchManifest({
    name: pkg.name,
    version: tag.version,
    config: pkg.config,
  }, {nothrow: true})

  if (!manifest) {
    const cwd = await getRoot(pkg.absPath)
    log({pkg})(`recover: tag '${tag.ref}' exists but ${pkg.name}@${tag.version} not found on npm, removing orphan tag`)
    await deleteRemoteTag({cwd, tag: tag.ref})
    pkg.latest = await getLatest(pkg)
  }
}
