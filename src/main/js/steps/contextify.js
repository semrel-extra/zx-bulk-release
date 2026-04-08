import {getPkgConfig} from '../config.js'
import {getLatest, getArtifactPath} from '../processor/meta.js'
import {getRoot, getSha, getRepo, deleteRemoteTag, fetchRepo, pushCommit} from '../api/git.js'
import {ghDeleteReleaseByTag} from '../api/gh.js'
import {fetchManifest} from '../api/npm.js'
import {log} from '../log.js'
import {$, fs, path} from 'zx-extra'

const META_BRANCH = 'meta'

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

// Tear down a release: delete GH release, meta entry, and git tag.
// Shared core of `rollbackRelease` (inline, mid-publish failure) and `recover` (standalone, orphan tag cleanup).
const teardownRelease = async (pkg, {tag, version, reason}) => {
  const cwd = await getRoot(pkg.absPath)
  const {ghBasicAuth: basicAuth, ghToken, ghApiUrl, gitCommitterName, gitCommitterEmail} = pkg.config
  if (!basicAuth) throw new Error(`${reason} requires git credentials (GH_TOKEN)`)
  const {repoName} = await getRepo(cwd, {basicAuth})

  // 1. Delete GitHub release (also removes attached meta assets)
  if (ghToken) {
    try {
      if (await ghDeleteReleaseByTag({ghApiUrl, ghToken, repoName, tag})) {
        log({pkg})(`${reason}: deleted gh release for '${tag}'`)
      }
    } catch (e) {
      log({pkg, level: 'warn'})(`${reason}: failed to delete gh release`, e)
    }
  }

  // 2. Remove meta entry from meta branch
  try {
    const metaCwd = await fetchRepo({cwd, branch: META_BRANCH, basicAuth})
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
      await pushCommit({cwd, branch: META_BRANCH, msg: `chore: ${reason} ${pkg.name} ${version}`, gitCommitterName, gitCommitterEmail, basicAuth})
      log({pkg})(`${reason}: removed meta for '${tag}'`)
    }
  } catch (e) {
    log({pkg, level: 'warn'})(`${reason}: failed to clean meta branch`, e)
  }

  // 3. Delete git tag
  await deleteRemoteTag({cwd, tag})
}

// Rollback a release that failed mid-publish (called inline from publish.js).
// Uses the current release tag; skips the npm existence check — we already know it failed.
export const rollbackRelease = async (pkg) => {
  const tag = pkg.context.git.tag
  if (!tag) return
  log({pkg})(`rollback: cleaning up failed release for tag '${tag}'`)
  await teardownRelease(pkg, {tag, version: pkg.version, reason: 'rollback'})
}

// Standalone recovery: if a tag exists but the package is missing from npm, treat it as an orphan and tear down.
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

  log({pkg})(`recover: tag '${tag.ref}' exists but ${pkg.name}@${tag.version} not found on npm, rolling back failed release`)
  await teardownRelease(pkg, {tag: tag.ref, version: tag.version, reason: 'recover'})
  return true
}
