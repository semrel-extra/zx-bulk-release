import {describe, test, expect} from 'vitest'
import {buildParcels} from '../../main/js/post/parcel/index.js'

describe('parcel.build', () => {
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

    expect(parcels.length).toBe(3)
    expect(parcels[0].channel).toBe('git-tag')
    expect(parcels[1].channel).toBe('npm')
    expect(parcels[2].channel).toBe('meta')
  })

  test('git-tag manifest has tag, cwd, and env placeholders', () => {
    const pkg = makePkg()
    const ctx = makeCtx()
    const [parcel] = buildParcels(pkg, ctx, {channels: ['git-tag'], ...makeArtifacts()})

    expect(parcel.manifest.tag).toBe(pkg.tag)
    expect(parcel.manifest.cwd).toBe(ctx.git.root)
    expect(parcel.manifest.gitCommitterName).toBe('${{GIT_COMMITTER_NAME}}')
    expect(parcel.files).toEqual([])
  })

  test('npm manifest includes registry/token placeholders and tarball file', () => {
    const pkg = makePkg()
    const ctx = makeCtx()
    const [parcel] = buildParcels(pkg, ctx, {
      channels: ['npm'],
      npmTarball: '/tmp/pkg.tgz',
      ...makeArtifacts(),
    })

    expect(parcel.manifest.registry).toBe('${{NPM_REGISTRY}}')
    expect(parcel.manifest.token).toBe('${{NPM_TOKEN}}')
    expect(parcel.files.length).toBe(1)
    expect(parcel.files[0].name).toBe('package.tgz')
  })

  test('npm parcel has no files when no tarball provided', () => {
    const pkg = makePkg()
    const ctx = makeCtx()
    const [parcel] = buildParcels(pkg, ctx, {channels: ['npm'], ...makeArtifacts()})

    expect(parcel.files).toEqual([])
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

    expect(parcel.manifest.releaseNotes).toBe('## notes')
    expect(parcel.files.length).toBe(1)
    expect(parcel.files[0].name).toBe('assets')
  })

  test('changelog manifest includes branch and file', () => {
    const pkg = makePkg({config: {...makePkg().config, changelog: 'changelog'}})
    const ctx = makeCtx()
    const [parcel] = buildParcels(pkg, ctx, {
      channels: ['changelog'],
      releaseNotes: '## release',
      ...makeArtifacts(),
    })

    expect(parcel.manifest.branch).toBe('changelog')
    expect(parcel.manifest.file.endsWith('-changelog.md')).toBeTruthy()
    expect(parcel.manifest.releaseNotes).toBe('## release')
  })

  test('meta manifest includes type and data', () => {
    const pkg = makePkg()
    const ctx = makeCtx()
    const [parcel] = buildParcels(pkg, ctx, {channels: ['meta'], ...makeArtifacts()})

    expect(parcel.manifest.type).toBe('commit')
    expect(parcel.manifest.data).toEqual(pkg.meta)
  })

  test('unknown channel gets a default entry', () => {
    const pkg = makePkg()
    const ctx = makeCtx()
    const [parcel] = buildParcels(pkg, ctx, {channels: ['custom-ch'], ...makeArtifacts()})

    expect(parcel.channel).toBe('custom-ch')
    expect(parcel.manifest.channel).toBe('custom-ch')
    expect(parcel.manifest.name).toBe('test-pkg')
    expect(parcel.files).toEqual([])
  })

  test('empty channels returns empty array', () => {
    const pkg = makePkg()
    const ctx = makeCtx()
    const parcels = buildParcels(pkg, ctx, {channels: [], ...makeArtifacts()})
    expect(parcels).toEqual([])
  })

})
