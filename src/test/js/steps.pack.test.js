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

const readTar = async (tarPath) => unpackTar(tarPath, tarPath + '.d')

const findTar = (tars, channel) => tars.find(t => path.basename(t).includes(`.${channel}.`))

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

test('pack creates tar array and sets activeTransport', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const cleanup = registerTestChannel('test-ch', {
      when: () => true, run: async () => {}, snapshot: false,
    })

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['test-ch'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.ok(Array.isArray(pkg.tars))
    assert.is(pkg.tars.length, 1)
    assert.ok(pkg.tars[0].endsWith('.tar'))
    assert.ok(pkg.activeTransport.includes('test-ch'))

    cleanup()
  })
})

test('pack tar manifest contains channel field', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['changelog'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    const {manifest} = await readTar(pkg.tars[0])
    assert.is(manifest.channel, 'changelog')
  })
})

test('pack npm tar contains package.tgz', async () => {
  await within(async () => {
    const mock = await setup([['npm pack', 'test-pkg-1.0.1.tgz']])
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

    const tar = findTar(pkg.tars, 'npm')
    assert.ok(tar)
    const {manifest, dir} = await readTar(tar)
    assert.is(manifest.channel, 'npm')
    assert.is(manifest.name, 'test-pkg')
    assert.is(manifest.version, '1.0.1')
    assert.is(manifest.token, '${{NPM_TOKEN}}')
    assert.is(manifest.registry, '${{NPM_REGISTRY}}')
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

    assert.is(findTar(pkg.tars, 'npm'), undefined)
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

    const tar = findTar(pkg.tars, 'gh-release')
    assert.ok(tar)
    const {manifest} = await readTar(tar)
    assert.is(manifest.channel, 'gh-release')
    assert.ok(manifest.releaseNotes)
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

    const tar = findTar(pkg.tars, 'changelog')
    assert.ok(tar)
    const {manifest} = await readTar(tar)
    assert.is(manifest.channel, 'changelog')
    assert.ok(manifest.releaseNotes)
    assert.ok(manifest.branch)
    assert.ok(manifest.file)
  })
})

test('pack gh-pages tar contains docs', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const docsDir = path.join(tmpDir, 'packages/test-pkg/docs')
    await fs.ensureDir(docsDir)
    await fs.writeFile(path.join(docsDir, 'index.html'), '<h1>docs</h1>')

    const pkg = makePkgWithManifest()
    pkg.config.ghPages = 'gh-pages'
    const ctx = makeCtx({channels: ['gh-pages'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    const tar = findTar(pkg.tars, 'gh-pages')
    assert.ok(tar)
    const {manifest, dir} = await readTar(tar)
    assert.is(manifest.channel, 'gh-pages')
    assert.is(manifest.branch, 'gh-pages')
    const docContent = await fs.readFile(path.join(dir, 'docs/index.html'), 'utf8')
    assert.is(docContent, '<h1>docs</h1>')
  })
})

test('pack gh-release tar contains staged assets', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const assetDir = path.join(tmpDir, 'packages/test-pkg')
    await fs.ensureDir(assetDir)
    await fs.writeFile(path.join(assetDir, 'dist.txt'), 'build output')

    const pkg = makePkgWithManifest()
    pkg.config.ghToken = 'tok'
    pkg.config.ghAssets = [{name: 'dist.txt', source: 'dist.txt'}]
    const ctx = makeCtx({channels: ['gh-release'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    const tar = findTar(pkg.tars, 'gh-release')
    const {manifest, dir} = await readTar(tar)
    assert.ok(manifest.assets)
    assert.is(await fs.readFile(path.join(dir, 'assets/dist.txt'), 'utf8'), 'build output')
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
    assert.ok(findTar(pkg.tars, 'snap-ok'))
    assert.is(findTar(pkg.tars, 'snap-no'), undefined)
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
    assert.is(pkg.tars.length, 0)
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

test('pack tar name includes tag, channel and hash', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkgWithManifest()
    const ctx = makeCtx({channels: ['changelog'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    const tarName = path.basename(pkg.tars[0])
    // parcel.{tag}.{channel}.{hash8}.tar
    assert.ok(tarName.startsWith('parcel.'))
    const parts = tarName.replace(/\.tar$/, '').split('.')
    const hash = parts.pop()
    const channel = parts.pop()
    const tag = parts.slice(1).join('.') // skip 'parcel' prefix

    assert.ok(tag.length > 0)
    assert.is(channel, 'changelog')
    assert.is(hash.length, 8)
    assert.ok(/^[0-9a-f]{8}$/.test(hash))
  })
})

test.run()
