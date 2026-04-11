// Builds a self-contained, JSON-serializable delivery manifest for each channel.
// Credentials are template placeholders (${{ENV_VAR}}) — resolved by courier at deliver time.
// File artifacts (tarball, docs, assets) are NOT in the manifest — they go into the tar container.

import {asTuple, msgJoin} from '../../util.js'

const entry = {
  npm: (pkg, ctx, a) => ({
    manifest: {
      name: pkg.name,
      version: pkg.version,
      registry: '${{NPM_REGISTRY}}',
      token: '${{NPM_TOKEN}}',
      config: '${{NPM_CONFIG}}',
      provenance: '${{NPM_PROVENANCE}}',
      oidc: '${{NPM_OIDC}}',
      preversion: pkg.preversion,
    },
    files: a.npmTarball ? [{name: 'package.tgz', source: a.npmTarball}] : [],
  }),

  'gh-release': (pkg, ctx, a) => ({
    manifest: {
      tag: pkg.tag,
      token: '${{GH_TOKEN}}',
      apiUrl: '${{GH_API_URL}}',
      repoName: a.repoName,
      releaseNotes: a.releaseNotes,
      assets: pkg.config.ghAssets ? [...pkg.config.ghAssets] : undefined,
    },
    files: a.assetsDir ? [{name: 'assets', source: a.assetsDir}] : [],
  }),

  'gh-pages': (pkg, ctx, a) => {
    const [branch = 'gh-pages', , to = '.', ..._msg] = asTuple(pkg.config.ghPages, ['branch', 'from', 'to', 'msg'])
    return {
      manifest: {
        branch,
        to,
        msg: msgJoin(_msg, pkg, 'docs: update docs ${{name}} ${{version}}'),
        repoHost: a.repoHost,
        repoName: a.repoName,
        originUrl: a.originUrl,
        gitCommitterEmail: pkg.config.gitCommitterEmail,
        gitCommitterName: pkg.config.gitCommitterName,
      },
      files: a.docsDir ? [{name: 'docs', source: a.docsDir}] : [],
    }
  },

  changelog: (pkg, ctx, a) => {
    const [branch = 'changelog', file = `${pkg.name.replace(/[^a-z0-9-]/ig, '')}-changelog.md`, ..._msg] = asTuple(pkg.config.changelog, ['branch', 'file', 'msg'])
    return {
      manifest: {
        releaseNotes: a.releaseNotes,
        branch,
        file,
        msg: msgJoin(_msg, pkg, 'chore: update changelog ${{name}}'),
        repoHost: a.repoHost,
        repoName: a.repoName,
        originUrl: a.originUrl,
        gitCommitterEmail: pkg.config.gitCommitterEmail,
        gitCommitterName: pkg.config.gitCommitterName,
      },
      files: [],
    }
  },

  meta: (pkg, ctx, a) => ({
    manifest: {
      name: pkg.name,
      version: pkg.version,
      tag: pkg.tag,
      type: pkg.config.meta?.type ?? null,
      data: pkg.meta,
      repoHost: a.repoHost,
      repoName: a.repoName,
      originUrl: a.originUrl,
      gitCommitterEmail: pkg.config.gitCommitterEmail,
      gitCommitterName: pkg.config.gitCommitterName,
    },
    files: [],
  }),
}

// Build parcel entries for each active channel.
// Returns {snapshot, channels: {name: {manifest, files}}}
export const buildParcel = (pkg, ctx, {
  snapshot = false,
  channels: channelNames = [],
  npmTarball,
  releaseNotes,
  docsDir,
  assetsDir,
  repoName,
  repoHost,
  originUrl,
} = {}) => {
  const a = {npmTarball, releaseNotes, docsDir, assetsDir, repoName, repoHost, originUrl}

  return {
    snapshot,
    channels: Object.fromEntries(
      channelNames.map(n => [n, entry[n]?.(pkg, ctx, a) ?? {manifest: {}, files: []}])
    ),
  }
}
