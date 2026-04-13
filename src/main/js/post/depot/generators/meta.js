// Meta generator: builds pkg.meta payload and resolves latest-release meta from git tags / gh assets / meta branch.

import {semver, $, fs, path} from 'zx-extra'
import {api} from '../../api/index.js'
import {parseTag} from './tag.js'

export const isAssetMode = (type) => type === 'asset' || type === 'assets'

// Build pkg.meta and, in asset mode, inject a meta.json entry into pkg.config.ghAssets.
// Runs in the prepare phase — serial, before any publisher.run() — so the asset mutation
// is guaranteed visible to gh-release.
export const prepareMeta = async (pkg) => {
  const {type} = pkg.config.meta
  if (type === null) return

  const {absPath: cwd} = pkg
  const hash = await api.git.getSha(cwd)
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

  if (isAssetMode(type)) {
    pkg.config.ghAssets = [...pkg.config.ghAssets || [], {
      name: 'meta.json',
      contents: JSON.stringify(pkg.meta, null, 2),
    }]
  }
}

export const getLatest = async (pkg) => {
  const {absPath: cwd, name} = pkg
  const tag = await getLatestTag(cwd, name)
  const meta = await getLatestMeta(pkg, tag)

  return {tag, meta}
}

export const getTags = async (cwd, ref) =>
  (await api.git.getTags(cwd, ref))
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
    const {repoName} = await api.git.getRepo(cwd, {basicAuth})

    try {
      return JSON.parse(await api.gh.ghGetAsset({repoName, tag, name: 'meta.json', ghUrl}))
    } catch {}

    try {
      const _cwd = await api.git.fetchRepo({cwd, branch: 'meta', basicAuth})
      return await Promise.any([
        fs.readJson(path.resolve(_cwd, `${getArtifactPath(tag)}.json`)),
        fs.readJson(path.resolve(_cwd, getArtifactPath(tag), 'meta.json'))
      ])
    } catch {}
  }

  return api.npm.fetchManifest(pkg, {nothrow: true})
}
