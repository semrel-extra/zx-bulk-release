import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {buildParcels} from '../../main/js/post/parcel/index.js'

const test = suite('parcel.build')

const makePkg = (overrides = {}) => ({
  name: 'test-pkg',
  version: '1.0.0',
  tag: '2026.4.12-test-pkg.1.0.0-f0',
  preversion: undefined,
  config: {
    ghApiUrl: 'https://api.github.com',
    ghAssets: undefined,
    ghPages: undefined,
    changelog: 'changelog',
    meta: {type: 'commit'},
    gitCommitterName: 'Bot',
    gitCommitterEmail: 'bot@test.com',
  },
  meta: {META_VERSION: '1', name: 'test-pkg'},
  ...overrides,
})

const makeCtx = () => ({
  git: {root: '/tmp/test'},
})

const makeArtifacts = (overrides = {}) => ({
  repoName: 'org/repo',
  repoHost: 'github.com',
  originUrl: 'https://github.com/org/repo.git',
  ...overrides,
})

test('builds parcels for specified channels', () => {
  const pkg = makePkg()
  const ctx = makeCtx()
  const parcels = buildParcels(pkg, ctx, {
    channels: ['git-tag', 'npm', 'meta'],
    ...makeArtifacts(),
  })

  assert.is(parcels.length, 3)
  assert.is(parcels[0].channel, 'git-tag')
  assert.is(parcels[1].channel, 'npm')
  assert.is(parcels[2].channel, 'meta')
})

test('git-tag manifest has tag, cwd, and env placeholders', () => {
  const pkg = makePkg()
  const ctx = makeCtx()
  const [parcel] = buildParcels(pkg, ctx, {channels: ['git-tag'], ...makeArtifacts()})

  assert.is(parcel.manifest.tag, pkg.tag)
  assert.is(parcel.manifest.cwd, ctx.git.root)
  assert.is(parcel.manifest.gitCommitterName, '${{GIT_COMMITTER_NAME}}')
  assert.equal(parcel.files, [])
})

test('npm manifest includes registry/token placeholders and tarball file', () => {
  const pkg = makePkg()
  const ctx = makeCtx()
  const [parcel] = buildParcels(pkg, ctx, {
    channels: ['npm'],
    npmTarball: '/tmp/pkg.tgz',
    ...makeArtifacts(),
  })

  assert.is(parcel.manifest.registry, '${{NPM_REGISTRY}}')
  assert.is(parcel.manifest.token, '${{NPM_TOKEN}}')
  assert.is(parcel.files.length, 1)
  assert.is(parcel.files[0].name, 'package.tgz')
})

test('npm parcel has no files when no tarball provided', () => {
  const pkg = makePkg()
  const ctx = makeCtx()
  const [parcel] = buildParcels(pkg, ctx, {channels: ['npm'], ...makeArtifacts()})

  assert.equal(parcel.files, [])
})

test('gh-release includes releaseNotes and assets dir', () => {
  const pkg = makePkg({config: {...makePkg().config, ghAssets: [{name: 'dist.zip'}]}})
  const ctx = makeCtx()
  const [parcel] = buildParcels(pkg, ctx, {
    channels: ['gh-release'],
    releaseNotes: '## notes',
    assetsDir: '/tmp/assets',
    ...makeArtifacts(),
  })

  assert.is(parcel.manifest.releaseNotes, '## notes')
  assert.is(parcel.files.length, 1)
  assert.is(parcel.files[0].name, 'assets')
})

test('changelog manifest includes branch and file', () => {
  const pkg = makePkg({config: {...makePkg().config, changelog: 'changelog'}})
  const ctx = makeCtx()
  const [parcel] = buildParcels(pkg, ctx, {
    channels: ['changelog'],
    releaseNotes: '## release',
    ...makeArtifacts(),
  })

  assert.is(parcel.manifest.branch, 'changelog')
  assert.ok(parcel.manifest.file.endsWith('-changelog.md'))
  assert.is(parcel.manifest.releaseNotes, '## release')
})

test('meta manifest includes type and data', () => {
  const pkg = makePkg()
  const ctx = makeCtx()
  const [parcel] = buildParcels(pkg, ctx, {channels: ['meta'], ...makeArtifacts()})

  assert.is(parcel.manifest.type, 'commit')
  assert.equal(parcel.manifest.data, pkg.meta)
})

test('unknown channel gets a default entry', () => {
  const pkg = makePkg()
  const ctx = makeCtx()
  const [parcel] = buildParcels(pkg, ctx, {channels: ['custom-ch'], ...makeArtifacts()})

  assert.is(parcel.channel, 'custom-ch')
  assert.is(parcel.manifest.channel, 'custom-ch')
  assert.is(parcel.manifest.name, 'test-pkg')
  assert.equal(parcel.files, [])
})

test('empty channels returns empty array', () => {
  const pkg = makePkg()
  const ctx = makeCtx()
  const parcels = buildParcels(pkg, ctx, {channels: [], ...makeArtifacts()})
  assert.equal(parcels, [])
})

test.run()
