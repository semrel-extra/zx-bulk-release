// Meta storage/retrieval: release tag pushing, meta branch artifacts, latest-release lookup.

import {queuefy} from 'queuefy'
import {semver, $, fs, path} from 'zx-extra'
import {log} from '../log.js'
import {fetchRepo, pushCommit, getTags as getGitTags, pushTag, getRepo} from '../api/git.js'
import {fetchManifest} from '../api/npm.js'
import {ghGetAsset} from '../api/gh.js'
import {formatTag, parseTag} from './tag.js'

export const pushReleaseTag = async (pkg) => {
  const {name, version, tag = formatTag({name, version}), config: {gitCommitterEmail, gitCommitterName}} = pkg
  const cwd = pkg.context.git.root

  pkg.context.git.tag = tag
  log({pkg})(`push release tag ${tag}`)

  await pushTag({cwd, tag, gitCommitterEmail, gitCommitterName})
}

// Build pkg.meta and, in asset mode, inject a meta.json entry into pkg.config.ghAssets.
// Runs in the prepare phase — serial, before any publisher.run() — so the asset mutation
// is guaranteed visible to gh-release.
export const prepareMeta = async (pkg) => {
  const {type} = pkg.config.meta
  if (type === null) return

  const {absPath: cwd} = pkg
  const hash = (await $.o({cwd})`git rev-parse HEAD`).toString().trim()
  pkg.meta = {
    META_VERSION: '1',
    hash,
    name: pkg.name,
    version: pkg.version,
    dependencies: pkg.dependencies,
    devDependencies: pkg.devDependencies,
    peerDependencies: pkg.peerDependencies,
    optionalDependencies: pkg.optionalDependencies,
  }

  if (type === 'asset' || type === 'assets') {
    pkg.config.ghAssets = [...pkg.config.ghAssets || [], {
      name: 'meta.json',
      contents: JSON.stringify(pkg.meta, null, 2),
    }]
  }
}

// Push the meta artifact to the `meta` branch. No-op in asset mode (handled by gh-release).
export const pushMetaBranch = queuefy(async (pkg) => {
  const {type} = pkg.config.meta
  if (type === null || type === 'asset' || type === 'assets') return

  log({pkg})('push artifact to branch \'meta\'')

  const {name, version, meta, tag = formatTag({name, version}), absPath: cwd, config: {gitCommitterEmail, gitCommitterName, ghBasicAuth: basicAuth}} = pkg
  const msg = `chore: release meta ${name} ${version}`
  const files = [{relpath: `${getArtifactPath(tag)}.json`, contents: meta}]

  await pushCommit({cwd, to: '.', branch: 'meta', msg, files, gitCommitterEmail, gitCommitterName, basicAuth})
})

// Remove a meta artifact for a given tag from the meta branch.
// Returns true if something was removed and pushed.
export const removeMetaArtifact = async (pkg, {tag, version, reason}) => {
  const {config: {meta: {type}, ghBasicAuth: basicAuth, gitCommitterName, gitCommitterEmail}} = pkg
  // Asset-mode meta lives inside the GH release; deleting the release already removes it.
  if (type === null || type === 'asset' || type === 'assets') return false

  const cwd = pkg.context?.git?.root || pkg.absPath
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

export const getLatest = async (pkg) => {
  const {absPath: cwd, name} = pkg
  const tag = await getLatestTag(cwd, name)
  const meta = await getLatestMeta(pkg, tag)

  return {
    tag,
    meta
  }
}

export const getTags = async (cwd, ref = '') =>
  (await getGitTags(cwd, ref))
    .map(tag => parseTag(tag.trim()))
    .filter(Boolean)
    .sort((a, b) => semver.rcompare(a.version, b.version))

export const getLatestTag = async (cwd, name) =>
  (await getTags(cwd)).find(tag => tag.name === name)

export const getLatestTaggedVersion = async (cwd, name) =>
  (await getLatestTag(cwd, name))?.version || undefined

export const getArtifactPath = (tag) => tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')

export const getLatestMeta = async (pkg, tag) => {
  if (tag) {
    const {absPath: cwd, config: {ghBasicAuth: basicAuth, ghUrl}} = pkg
    const {repoName} = await getRepo(cwd, {basicAuth})

    try {
      return JSON.parse(await ghGetAsset({repoName, tag, name: 'meta.json', ghUrl}))
    } catch {}

    try {
      const _cwd = await fetchRepo({cwd, branch: 'meta', basicAuth})
      return await Promise.any([
        fs.readJson(path.resolve(_cwd, `${getArtifactPath(tag)}.json`)),
        fs.readJson(path.resolve(_cwd, getArtifactPath(tag), 'meta.json'))
      ])
    } catch {}
  }

  return fetchManifest(pkg, {nothrow: true})
}
