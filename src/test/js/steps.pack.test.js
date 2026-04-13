import {describe, test, expect} from 'vitest'
import {$, within, fs, path} from 'zx-extra'
import {createSpawnMock, defaultResponses, makePkg, makeCtx, has, tmpDir} from './utils/mock.js'
import {channels} from '../../main/js/post/courier/index.js'
import {unpackTar} from '../../main/js/post/tar.js'

describe('steps.pack', () => {
  const setup = async (responses = []) => {
    await fs.ensureDir(tmpDir)
    await fs.writeJson(`${tmpDir}/package.json`, {name: 'test-pkg', version: '1.0.1'}, {spaces: 2})
    const mock = createSpawnMock([...responses, ...defaultResponses()])
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
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

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

      expect(prepared).toEqual(['done'])
      cleanup()
    })
  })

  test('pack creates tar array and sets activeTransport', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const cleanup = registerTestChannel('test-ch', {
        when: () => true, run: async () => {}, snapshot: false,
      })

      const pkg = makePkgWithManifest()
      const ctx = makeCtx({channels: ['test-ch'], flags: {}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      expect(Array.isArray(pkg.tars)).toBeTruthy()
      expect(pkg.tars.length).toBe(1)
      expect(pkg.tars[0].endsWith('.tar')).toBeTruthy()
      expect(pkg.activeTransport.includes('test-ch')).toBeTruthy()

      cleanup()
    })
  })

  test('pack tar manifest contains channel field', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const pkg = makePkgWithManifest()
      const ctx = makeCtx({channels: ['changelog'], flags: {}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      const {manifest} = await readTar(pkg.tars[0])
      expect(manifest.channel).toBe('changelog')
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
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const pkg = makePkgWithManifest()
      const ctx = makeCtx({channels: ['npm'], flags: {}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      const tar = findTar(pkg.tars, 'npm')
      expect(tar).toBeTruthy()
      const {manifest, dir} = await readTar(tar)
      expect(manifest.channel).toBe('npm')
      expect(manifest.name).toBe('test-pkg')
      expect(manifest.version).toBe('1.0.1')
      expect(manifest.token).toBe('${{NPM_TOKEN}}')
      expect(manifest.registry).toBe('${{NPM_REGISTRY}}')
      expect(await fs.pathExists(path.join(dir, 'package.tgz'))).toBeTruthy()
    })
  })

  test('pack skips npm tar for private packages', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const pkg = makePkgWithManifest({manifest: {name: 'test-pkg', version: '1.0.1', private: true}})
      const ctx = makeCtx({channels: ['npm'], flags: {}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      expect(findTar(pkg.tars, 'npm')).toBe(undefined)
    })
  })

  test('pack gh-release tar contains release notes and template tokens', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const pkg = makePkgWithManifest()
      pkg.config.ghToken = 'tok'
      const ctx = makeCtx({channels: ['gh-release'], flags: {}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      const tar = findTar(pkg.tars, 'gh-release')
      expect(tar).toBeTruthy()
      const {manifest} = await readTar(tar)
      expect(manifest.channel).toBe('gh-release')
      expect(manifest.releaseNotes).toBeTruthy()
      expect(manifest.token).toBe('${{GH_TOKEN}}')
      expect(manifest.apiUrl).toBe('https://api.github.com')
      expect(manifest.repoName).toBeTruthy()
    })
  })

  test('pack changelog tar contains release notes', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const pkg = makePkgWithManifest()
      const ctx = makeCtx({channels: ['changelog'], flags: {}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      const tar = findTar(pkg.tars, 'changelog')
      expect(tar).toBeTruthy()
      const {manifest} = await readTar(tar)
      expect(manifest.channel).toBe('changelog')
      expect(manifest.releaseNotes).toBeTruthy()
      expect(manifest.branch).toBeTruthy()
      expect(manifest.file).toBeTruthy()
    })
  })

  test('pack gh-pages tar contains docs', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const docsDir = path.join(tmpDir, 'packages/test-pkg/docs')
      await fs.ensureDir(docsDir)
      await fs.writeFile(path.join(docsDir, 'index.html'), '<h1>docs</h1>')

      const pkg = makePkgWithManifest()
      pkg.config.ghPages = 'gh-pages'
      const ctx = makeCtx({channels: ['gh-pages'], flags: {}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      const tar = findTar(pkg.tars, 'gh-pages')
      expect(tar).toBeTruthy()
      const {manifest, dir} = await readTar(tar)
      expect(manifest.channel).toBe('gh-pages')
      expect(manifest.branch).toBe('gh-pages')
      const docContent = await fs.readFile(path.join(dir, 'docs/index.html'), 'utf8')
      expect(docContent).toBe('<h1>docs</h1>')
    })
  })

  test('pack gh-release tar contains staged assets', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

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
      expect(manifest.assets).toBeTruthy()
      expect(await fs.readFile(path.join(dir, 'assets/dist.txt'), 'utf8')).toBe('build output')
    })
  })

  test('pack filters inactive channels in snapshot mode', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const c1 = registerTestChannel('snap-ok', {when: () => true, run: async () => {}, snapshot: true})
      const c2 = registerTestChannel('snap-no', {when: () => true, run: async () => {}, snapshot: false})

      const pkg = makePkgWithManifest()
      const ctx = makeCtx({channels: ['snap-ok', 'snap-no'], flags: {snapshot: true}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      expect(pkg.activeTransport.includes('snap-ok')).toBeTruthy()
      expect(pkg.activeTransport.includes('snap-no')).toBeFalsy()
      expect(findTar(pkg.tars, 'snap-ok')).toBeTruthy()
      expect(findTar(pkg.tars, 'snap-no')).toBe(undefined)
      c1(); c2()
    })
  })

  test('pack excludes cmd from transport channels', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const pkg = makePkgWithManifest()
      const ctx = makeCtx({channels: ['cmd'], flags: {}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      expect(pkg.activeTransport.includes('cmd')).toBeFalsy()
      expect(pkg.tars.length).toBe(0)
    })
  })

  test('pack persists manifest', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const pkg = makePkgWithManifest()
      const ctx = makeCtx({channels: [], flags: {}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      const written = await fs.readJson(`${tmpDir}/package.json`)
      expect(written.version).toBe('1.0.1')
    })
  })

  test('pack tar name includes tag, channel and hash', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const pkg = makePkgWithManifest()
      const ctx = makeCtx({channels: ['changelog'], flags: {}})
      pkg.ctx = ctx

      await pack(pkg, ctx)

      const tarName = path.basename(pkg.tars[0])
      // parcel.{sha7}.{channel}.{safeName}.{version}.{hash}.tar
      expect(tarName.startsWith('parcel.')).toBeTruthy()
      const parts = tarName.replace(/\.tar$/, '').split('.')
      const hash = parts.pop()
      const sha = parts[1]
      const channel = parts[2]

      expect(channel).toBe('changelog')
      expect(sha.length).toBe(7)
      expect(/^[0-9a-f]{7}$/.test(sha)).toBeTruthy()
      expect(hash.length).toBe(6)
      expect(/^[0-9a-f]{6}$/.test(hash)).toBeTruthy()
      expect(tarName.includes('.test-pkg.')).toBeTruthy()
    })
  })

})
