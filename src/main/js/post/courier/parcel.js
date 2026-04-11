// Builds a self-contained, JSON-serializable delivery parcel.
// Each channel entry is a sealed envelope — fully self-contained,
// no shared context. This allows future multi-target delivery
// (e.g. npm + gh-packages, jsr, docker) where each target has its own creds/config.

import {asTuple, msgJoin} from '../../util.js'

const entry = {
  npm: (pkg, ctx, a) => ({
    name: pkg.name,
    version: pkg.version,
    tarball: a.npmTarball,
    registry: pkg.config.npmRegistry,
    token: pkg.config.npmToken,
    config: pkg.config.npmConfig,
    provenance: pkg.config.npmProvenance,
    oidc: pkg.config.npmOidc,
    preversion: pkg.preversion,
  }),

  'gh-release': (pkg, ctx, a) => ({
    tag: pkg.tag,
    token: pkg.config.ghToken,
    apiUrl: pkg.config.ghApiUrl,
    repoName: a.repoName,
    releaseNotes: a.releaseNotes,
    assets: pkg.config.ghAssets ? [...pkg.config.ghAssets] : undefined,
    assetsDir: a.assetsDir,
  }),

  'gh-pages': (pkg, ctx, a) => {
    const [branch = 'gh-pages', , to = '.', ..._msg] = asTuple(pkg.config.ghPages, ['branch', 'from', 'to', 'msg'])
    return {
      docsDir: a.docsDir,
      branch,
      to,
      msg: msgJoin(_msg, pkg, 'docs: update docs ${{name}} ${{version}}'),
      repoAuthedUrl: a.repoAuthedUrl,
      gitCommitterEmail: pkg.config.gitCommitterEmail,
      gitCommitterName: pkg.config.gitCommitterName,
      ghBasicAuth: pkg.config.ghBasicAuth,
    }
  },

  changelog: (pkg, ctx, a) => {
    const [branch = 'changelog', file = `${pkg.name.replace(/[^a-z0-9-]/ig, '')}-changelog.md`, ..._msg] = asTuple(pkg.config.changelog, ['branch', 'file', 'msg'])
    return {
      releaseNotes: a.releaseNotes,
      branch,
      file,
      msg: msgJoin(_msg, pkg, 'chore: update changelog ${{name}}'),
      gitRoot: ctx.git?.root,
      repoAuthedUrl: a.repoAuthedUrl,
      gitCommitterEmail: pkg.config.gitCommitterEmail,
      gitCommitterName: pkg.config.gitCommitterName,
      ghBasicAuth: pkg.config.ghBasicAuth,
    }
  },

  meta: (pkg, ctx, a) => ({
    name: pkg.name,
    version: pkg.version,
    tag: pkg.tag,
    type: pkg.config.meta?.type ?? null,
    data: pkg.meta,
    gitRoot: ctx.git?.root,
    repoAuthedUrl: a.repoAuthedUrl,
    gitCommitterEmail: pkg.config.gitCommitterEmail,
    gitCommitterName: pkg.config.gitCommitterName,
    ghBasicAuth: pkg.config.ghBasicAuth,
  }),
}

export const buildParcel = (pkg, ctx, {
  snapshot = false,
  channels: channelNames = [],
  npmTarball,
  releaseNotes,
  docsDir,
  assetsDir,
  repoName,
  repoAuthedUrl,
} = {}) => {
  const a = {npmTarball, releaseNotes, docsDir, assetsDir, repoName, repoAuthedUrl}

  return {
    snapshot,
    channels: Object.fromEntries(
      channelNames.map(n => [n, entry[n]?.(pkg, ctx, a) ?? {}])
    ),
  }
}
