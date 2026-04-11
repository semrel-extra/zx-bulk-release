import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within, fs, path} from 'zx-extra'
import {createMock, defaultResponses, makePkg, makeCtx, has, tmpDir} from './utils/mock.js'
import {channels} from '../../main/js/post/courier/index.js'

const test = suite('steps.pack')

const setup = async (responses = []) => {
  await fs.ensureDir(tmpDir)
  await fs.writeJson(`${tmpDir}/package.json`, {name: 'test-pkg', version: '1.0.1'}, {spaces: 2})
  const mock = createMock([...responses, ...defaultResponses()])
  $.spawn = mock.spawn
  $.quiet = true
  $.verbose = false
  $.memo = new Map()
  $.report = undefined
  return mock
}

const registerTestChannel = (name, impl) => {
  channels[name] = {name, ...impl}
  return () => { delete channels[name] }
}

const makePkgWithManifest = (overrides = {}) => makePkg({
  version: '1.0.1',
  extra: {
    manifest: {name: 'test-pkg', version: '1.0.1', private: false},
    manifestRaw: '{}',
    manifestAbsPath: `${tmpDir}/package.json`,
    ...overrides,
  },
})

test('pack calls prepare on channels', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const prepared = []
    const cleanup = registerTestChannel('prep-ch', {
      when: () => true,
      prepare: async () => prepared.push('done'),
      run: async () => {},
      snapshot: false,
    })

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['prep-ch'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.equal(prepared, ['done'])
    cleanup()
  })
})

test('pack sets artifacts and activeTransport on pkg', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const cleanup = registerTestChannel('test-ch', {
      when: () => true,
      run: async () => {},
      snapshot: false,
    })

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['test-ch'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.artifacts)
    assert.ok(Array.isArray(pkg.activeTransport))
    assert.ok(pkg.activeTransport.includes('test-ch'))
    cleanup()
  })
})

test('pack resolves repoName and repoAuthedUrl', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: [], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.artifacts.repoName, 'repoName should be resolved')
    assert.ok(typeof pkg.artifacts.repoName === 'string')
  })
})

test('pack creates npm tarball when npm channel is active', async () => {
  await within(async () => {
    await setup([['npm pack', 'test-pkg-1.0.1.tgz']])
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['npm'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.artifacts.npmTarball)
    assert.ok(pkg.artifacts.npmTarball.endsWith('test-pkg-1.0.1.tgz'))
    assert.ok(pkg.activeTransport.includes('npm'))
  })
})

test('pack skips npm tarball when npm channel is not active', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest({manifest: {name: 'test-pkg', version: '1.0.1', private: true}})
    const ctx = makeCtx({channels: ['npm'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    // npm channel is filtered out for private packages
    assert.is(pkg.artifacts.npmTarball, undefined)
  })
})

test('pack renders release notes for gh-release channel', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    pkg.config.ghToken = 'tok'
    const ctx = makeCtx({channels: ['gh-release'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.artifacts.releaseNotes)
    assert.ok(typeof pkg.artifacts.releaseNotes === 'string')
    assert.ok(pkg.artifacts.releaseNotes.length > 0)
  })
})

test('pack renders release notes for changelog channel', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['changelog'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.artifacts.releaseNotes)
    assert.ok(pkg.artifacts.releaseNotes.includes('test-pkg'))
  })
})

test('pack skips release notes when not needed', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const cleanup = registerTestChannel('other-ch', {
      when: () => true,
      run: async () => {},
      snapshot: false,
    })

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['other-ch'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.is(pkg.artifacts.releaseNotes, undefined)
    cleanup()
  })
})

test('pack copies docs for gh-pages channel', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    // Create docs dir in package absPath
    const docsDir = path.join(tmpDir, 'packages/test-pkg/docs')
    await fs.ensureDir(docsDir)
    await fs.writeFile(path.join(docsDir, 'index.html'), '<h1>docs</h1>')

    const pkg = makePkgWithManifest()
    pkg.config.ghPages = 'gh-pages'
    const ctx = makeCtx({channels: ['gh-pages'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.artifacts.docsDir)
    // docsDir should be a temp copy, not the original
    assert.not.equal(pkg.artifacts.docsDir, docsDir)
    // copied content should exist
    const copied = await fs.readFile(path.join(pkg.artifacts.docsDir, 'index.html'), 'utf8')
    assert.is(copied, '<h1>docs</h1>')
  })
})

test('pack skips docs when gh-pages is not active', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    pkg.config.ghPages = undefined
    const ctx = makeCtx({channels: ['gh-pages'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.is(pkg.artifacts.docsDir, undefined)
  })
})

test('pack stages assets for gh-release with ghAssets', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    // Create an asset file
    const assetPath = path.join(tmpDir, 'packages/test-pkg/dist.txt')
    await fs.ensureDir(path.dirname(assetPath))
    await fs.writeFile(assetPath, 'build output')

    const pkg = makePkgWithManifest()
    pkg.config.ghToken = 'tok'
    pkg.config.ghAssets = [{name: 'dist.txt', source: 'dist.txt'}]
    const ctx = makeCtx({channels: ['gh-release'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.artifacts.assetsDir)
    const staged = await fs.readFile(path.join(pkg.artifacts.assetsDir, 'dist.txt'), 'utf8')
    assert.is(staged, 'build output')
  })
})

test('pack filters inactive channels in snapshot mode', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const c1 = registerTestChannel('snap-ok', {when: () => true, run: async () => {}, snapshot: true})
    const c2 = registerTestChannel('snap-no', {when: () => true, run: async () => {}, snapshot: false})

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['snap-ok', 'snap-no'], flags: {snapshot: true}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.activeTransport.includes('snap-ok'))
    assert.not.ok(pkg.activeTransport.includes('snap-no'))
    c1(); c2()
  })
})

test('pack excludes cmd from transport channels', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['cmd'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.not.ok(pkg.activeTransport.includes('cmd'))
  })
})

test('pack persists manifest', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: [], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    const written = await fs.readJson(`${tmpDir}/package.json`)
    assert.is(written.version, '1.0.1')
  })
})

test.run()
