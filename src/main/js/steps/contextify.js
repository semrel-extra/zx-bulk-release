import {getPkgConfig} from '../config.js'
import {getLatest, getArtifactPath} from '../processor/meta.js'
import {getRoot, getSha, getRepo, deleteRemoteTag, fetchRepo, pushCommit} from '../api/git.js'
import {fetchManifest} from '../api/npm.js'
import {log} from '../log.js'
import {$, fs, path, fetch} from 'zx-extra'

// Inspired by https://docs.github.com/en/actions/learn-github-actions/contexts
export const contextify = async (pkg, {packages, root, flags, env}) => {
  pkg.config = await getPkgConfig([pkg.absPath, root.absPath], env)
  pkg.latest = await getLatest(pkg)
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

// Rollback a release that failed mid-publish (called inline from publish.js).
// Unlike `recover`, this uses the current release tag (pkg.context.git.tag)
// and skips the npm existence check — we already know the release failed.
export const rollbackRelease = async (pkg) => {
  const tag = pkg.context.git.tag
  if (!tag) return

  const cwd = pkg.context.git.root
  const {ghBasicAuth: basicAuth, ghToken, ghApiUrl, gitCommitterName, gitCommitterEmail} = pkg.config
  if (!basicAuth) throw new Error('rollback requires git credentials (GH_TOKEN)')
  const {repoName} = await getRepo(cwd, {basicAuth})

  log({pkg})(`rollback: cleaning up failed release for tag '${tag}'`)

  // 1. Delete GitHub release
  if (ghToken) {
    try {
      const res = await fetch(`${ghApiUrl}/repos/${repoName}/releases/tags/${tag}`, {
        headers: {Authorization: `token ${ghToken}`, 'X-GitHub-Api-Version': '2022-11-28'}
      })
      if (res.ok) {
        const {id} = await res.json()
        await fetch(`${ghApiUrl}/repos/${repoName}/releases/${id}`, {
          method: 'DELETE',
          headers: {Authorization: `token ${ghToken}`, 'X-GitHub-Api-Version': '2022-11-28'}
        })
        log({pkg})(`rollback: deleted gh release for '${tag}'`)
      }
    } catch (e) {
      log({pkg, level: 'warn'})('rollback: failed to delete gh release', e)
    }
  }

  // 2. Remove meta entry from meta branch
  try {
    const metaBranch = 'meta'
    const metaCwd = await fetchRepo({cwd, branch: metaBranch, basicAuth})
    const artifactPath = getArtifactPath(tag)
    const candidates = [
      path.resolve(metaCwd, `${artifactPath}.json`),
      path.resolve(metaCwd, artifactPath)
    ]
    let removed = false
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        await fs.remove(p)
        removed = true
      }
    }
    if (removed) {
      await pushCommit({cwd, branch: metaBranch, msg: `chore: rollback ${pkg.name} ${pkg.version}`, gitCommitterName, gitCommitterEmail, basicAuth})
      log({pkg})(`rollback: removed meta for '${tag}'`)
    }
  } catch (e) {
    log({pkg, level: 'warn'})('rollback: failed to clean meta branch', e)
  }

  // 3. Delete git tag
  await deleteRemoteTag({cwd, tag})
}

// Rollback a partially failed release: delete orphan tag, meta, changelog, gh release.
export const recover = async (pkg) => {
  const needsNpm = !pkg.manifest.private && pkg.config.npmPublish !== false
  if (!needsNpm) return false

  const {tag} = pkg.latest
  if (!tag) return false

  const manifest = await fetchManifest({
    name: pkg.name,
    version: tag.version,
    config: pkg.config,
  }, {nothrow: true})

  if (manifest) return false

  const cwd = await getRoot(pkg.absPath)
  const {ghBasicAuth: basicAuth, ghToken, ghApiUrl, gitCommitterName, gitCommitterEmail} = pkg.config
  if (!basicAuth) throw new Error('recover requires git credentials (GH_TOKEN)')
  const {repoName} = await getRepo(cwd, {basicAuth})

  log({pkg})(`recover: tag '${tag.ref}' exists but ${pkg.name}@${tag.version} not found on npm, rolling back failed release`)

  // 1. Delete GitHub release (also removes attached meta assets)
  if (ghToken) {
    try {
      const res = await fetch(`${ghApiUrl}/repos/${repoName}/releases/tags/${tag.ref}`, {
        headers: {Authorization: `token ${ghToken}`, 'X-GitHub-Api-Version': '2022-11-28'}
      })
      if (res.ok) {
        const {id} = await res.json()
        await fetch(`${ghApiUrl}/repos/${repoName}/releases/${id}`, {
          method: 'DELETE',
          headers: {Authorization: `token ${ghToken}`, 'X-GitHub-Api-Version': '2022-11-28'}
        })
        log({pkg})(`recover: deleted gh release for '${tag.ref}'`)
      }
    } catch (e) {
      log({pkg, level: 'warn'})('recover: failed to delete gh release', e)
    }
  }

  // 2. Remove meta entry from meta branch
  try {
    const metaBranch = 'meta'
    const metaCwd = await fetchRepo({cwd, branch: metaBranch, basicAuth})
    const artifactPath = getArtifactPath(tag.ref)
    const candidates = [
      path.resolve(metaCwd, `${artifactPath}.json`),
      path.resolve(metaCwd, artifactPath)
    ]
    let removed = false
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        await fs.remove(p)
        removed = true
      }
    }
    if (removed) {
      await pushCommit({cwd, branch: metaBranch, msg: `chore: recover ${pkg.name} ${tag.version}`, gitCommitterName, gitCommitterEmail, basicAuth})
      log({pkg})(`recover: removed meta for '${tag.ref}'`)
    }
  } catch (e) {
    log({pkg, level: 'warn'})('recover: failed to clean meta branch', e)
  }

  // 3. Delete orphan git tag
  await deleteRemoteTag({cwd, tag: tag.ref})

  return true
}
