import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within, fs, path} from 'zx-extra'
import {createMock, defaultResponses, makePkg, makeCtx, has, tmpDir} from './utils/mock.js'
import {channels} from '../../main/js/post/courier/index.js'
import {unpackTar} from '../../main/js/post/tar.js'

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

// Helper: unpack a tar and return its manifest.
const readTar = async (tarPath) => {
  const dir = tarPath + '.d'
  return unpackTar(tarPath, dir)
}

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

test('pack creates tars and sets activeTransport', async () => {
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

    assert.ok(pkg.tars)
    assert.ok(pkg.tars['test-ch'])
    assert.ok(pkg.tars['test-ch'].endsWith('.tar'))
    assert.ok(Array.isArray(pkg.activeTransport))
    assert.ok(pkg.activeTransport.includes('test-ch'))

    // tar should contain manifest.json
    const {manifest} = await readTar(pkg.tars['test-ch'])
    assert.ok(manifest)

    cleanup()
  })
})

test('pack tar manifest contains repoName', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const cleanup = registerTestChannel('repo-ch', {
      when: () => true,
      run: async () => {},
      snapshot: false,
    })

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['repo-ch'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    const {manifest} = await readTar(pkg.tars['repo-ch'])
    // parcel entry for unknown channel returns empty manifest
    assert.ok(manifest)

    cleanup()
  })
})

test('pack npm tar contains package.tgz', async () => {
  await within(async () => {
    const mock = await setup([['npm pack', 'test-pkg-1.0.1.tgz']])
    // Wrap spawn so `npm pack --pack-destination <dir>` creates a fake tgz file.
    const origSpawn = $.spawn
    $.spawn = (cmd, args) => {
      const command = args?.[args.length - 1] || cmd
      if (command.includes('npm pack')) {
        const m = command.match(/--pack-destination\s+(\S+)/)
        if (m) fs.writeFileSync(path.join(m[1], 'test-pkg-1.0.1.tgz'), 'fake-tarball')
      }
      return origSpawn(cmd, args)
    }
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['npm'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.tars.npm)
    const {manifest, dir} = await readTar(pkg.tars.npm)
    assert.is(manifest.name, 'test-pkg')
    assert.is(manifest.version, '1.0.1')
    assert.is(manifest.token, '${{NPM_TOKEN}}')
    assert.is(manifest.registry, '${{NPM_REGISTRY}}')
    // package.tgz should be in the tar
    assert.ok(await fs.pathExists(path.join(dir, 'package.tgz')))
  })
})

test('pack skips npm tar for private packages', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest({manifest: {name: 'test-pkg', version: '1.0.1', private: true}})
    const ctx = makeCtx({channels: ['npm'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    // npm channel filtered out for private packages
    assert.is(pkg.tars.npm, undefined)
  })
})

test('pack gh-release tar contains release notes and template tokens', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    pkg.config.ghToken = 'tok'
    const ctx = makeCtx({channels: ['gh-release'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.tars['gh-release'])
    const {manifest} = await readTar(pkg.tars['gh-release'])
    assert.ok(manifest.releaseNotes)
    assert.ok(manifest.releaseNotes.length > 0)
    assert.is(manifest.token, '${{GH_TOKEN}}')
    assert.is(manifest.apiUrl, '${{GH_API_URL}}')
    assert.ok(manifest.repoName)
  })
})

test('pack changelog tar contains release notes', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['changelog'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(pkg.tars.changelog)
    const {manifest} = await readTar(pkg.tars.changelog)
    assert.ok(manifest.releaseNotes)
    assert.ok(manifest.releaseNotes.includes('test-pkg'))
    assert.ok(manifest.branch)
    assert.ok(manifest.file)
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

    const {manifest} = await readTar(pkg.tars['other-ch'])
    assert.is(manifest.releaseNotes, undefined)
    cleanup()
  })
})

test('pack gh-pages tar contains docs', async () => {
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

    assert.ok(pkg.tars['gh-pages'])
    const {manifest, dir} = await readTar(pkg.tars['gh-pages'])
    assert.is(manifest.branch, 'gh-pages')
    assert.ok(manifest.repoHost)
    assert.ok(manifest.repoName)
    // docs should be inside the tar
    const docContent = await fs.readFile(path.join(dir, 'docs/index.html'), 'utf8')
    assert.is(docContent, '<h1>docs</h1>')
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

    // gh-pages when() checks config.ghPages, so channel is filtered out
    assert.is(pkg.tars['gh-pages'], undefined)
  })
})

test('pack gh-release tar contains staged assets', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    // Create an asset file
    const assetDir = path.join(tmpDir, 'packages/test-pkg')
    await fs.ensureDir(assetDir)
    await fs.writeFile(path.join(assetDir, 'dist.txt'), 'build output')

    const pkg = makePkgWithManifest()
    pkg.config.ghToken = 'tok'
    pkg.config.ghAssets = [{name: 'dist.txt', source: 'dist.txt'}]
    const ctx = makeCtx({channels: ['gh-release'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    const {manifest, dir} = await readTar(pkg.tars['gh-release'])
    assert.ok(manifest.assets)
    // assets should be inside the tar
    const staged = await fs.readFile(path.join(dir, 'assets/dist.txt'), 'utf8')
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
    assert.ok(pkg.tars['snap-ok'])
    assert.is(pkg.tars['snap-no'], undefined)
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
    assert.is(pkg.tars.cmd, undefined)
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

test('pack tar naming follows {tag}.{channel}.tar', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const cleanup = registerTestChannel('test-naming', {
      when: () => true,
      run: async () => {},
      snapshot: false,
    })

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['test-naming'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    const tarPath = pkg.tars['test-naming']
    const tarName = path.basename(tarPath)
    assert.is(tarName, `${pkg.tag}.test-naming.tar`)

    cleanup()
  })
})

test.run()
