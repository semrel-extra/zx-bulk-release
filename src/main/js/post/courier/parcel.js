import {asTuple, msgJoin} from '../../util.js'

const gitFields = (a, pkg) => ({
  repoHost: a.repoHost,
  repoName: a.repoName,
  originUrl: a.originUrl,
  gitCommitterEmail: pkg.config.gitCommitterEmail,
  gitCommitterName: pkg.config.gitCommitterName,
})

const entry = {
  npm: (pkg, ctx, a) => ({
    channel: 'npm',
    manifest: {
      channel: 'npm',
      name: pkg.name, version: pkg.version, preversion: pkg.preversion,
      registry: '${{NPM_REGISTRY}}', token: '${{NPM_TOKEN}}',
      config: '${{NPM_CONFIG}}', provenance: '${{NPM_PROVENANCE}}', oidc: '${{NPM_OIDC}}',
    },
    files: a.npmTarball ? [{name: 'package.tgz', source: a.npmTarball}] : [],
  }),

  'gh-release': (pkg, ctx, a) => ({
    channel: 'gh-release',
    manifest: {
      channel: 'gh-release',
      tag: pkg.tag, repoName: a.repoName, releaseNotes: a.releaseNotes,
      token: '${{GH_TOKEN}}', apiUrl: '${{GH_API_URL}}',
      assets: pkg.config.ghAssets ? [...pkg.config.ghAssets] : undefined,
    },
    files: a.assetsDir ? [{name: 'assets', source: a.assetsDir}] : [],
  }),

  'gh-pages': (pkg, ctx, a) => {
    const [branch = 'gh-pages', , to = '.', ..._msg] = asTuple(pkg.config.ghPages, ['branch', 'from', 'to', 'msg'])
    return {
      channel: 'gh-pages',
      manifest: {channel: 'gh-pages', branch, to, msg: msgJoin(_msg, pkg, 'docs: update docs ${{name}} ${{version}}'), ...gitFields(a, pkg)},
      files: a.docsDir ? [{name: 'docs', source: a.docsDir}] : [],
    }
  },

  changelog: (pkg, ctx, a) => {
    const [branch = 'changelog', file = `${pkg.name.replace(/[^a-z0-9-]/ig, '')}-changelog.md`, ..._msg] = asTuple(pkg.config.changelog, ['branch', 'file', 'msg'])
    return {
      channel: 'changelog',
      manifest: {channel: 'changelog', releaseNotes: a.releaseNotes, branch, file, msg: msgJoin(_msg, pkg, 'chore: update changelog ${{name}}'), ...gitFields(a, pkg)},
      files: [],
    }
  },

  meta: (pkg, ctx, a) => ({
    channel: 'meta',
    manifest: {
      channel: 'meta',
      name: pkg.name, version: pkg.version, tag: pkg.tag,
      type: pkg.config.meta?.type ?? null, data: pkg.meta,
      ...gitFields(a, pkg),
    },
    files: [],
  }),
}

const defaultEntry = (channel) => (pkg, ctx, a) => ({
  channel,
  manifest: {channel, name: pkg.name, version: pkg.version, tag: pkg.tag},
  files: [],
})

export const buildParcels = (pkg, ctx, {
  channels: channelNames = [],
  npmTarball, releaseNotes, docsDir, assetsDir,
  repoName, repoHost, originUrl,
} = {}) => {
  const a = {npmTarball, releaseNotes, docsDir, assetsDir, repoName, repoHost, originUrl}
  return channelNames.map(n => (entry[n] || defaultEntry(n))(pkg, ctx, a))
}
