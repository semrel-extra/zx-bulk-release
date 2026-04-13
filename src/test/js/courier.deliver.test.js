import {describe, test, expect, beforeAll, afterAll} from 'vitest'
import {$, within, fs, path, tempy} from 'zx-extra'
import {createSpawnMock, defaultResponses, makePkg, makeCtx, has, tmpDir} from './utils/mock.js'
import {createGhServer} from './utils/gh-server.js'
import {channels, deliver, resolveManifest} from '../../main/js/post/courier/index.js'
import {buildParcels} from '../../main/js/post/parcel/build.js'
import {packTar, unpackTar} from '../../main/js/post/tar.js'

describe('courier.deliver', () => {
  let gh
  beforeAll(async () => { gh = await createGhServer() })
  afterAll(() => gh.close())

  const setup = async (responses = []) => {
    await fs.ensureDir(tmpDir)
    await fs.writeJson(`${tmpDir}/package.json`, {name: 'test-pkg', version: '1.0.1'}, {spaces: 2})
    Object.keys(gh.routes).forEach(k => delete gh.routes[k])
    gh.requests.length = 0
    const mock = createSpawnMock([...responses, ...defaultResponses()])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()
    $.report = undefined
    return mock
  }

  const writeTmpFile = async (content) => {
    const p = path.join(tempy.temporaryDirectory(), 'file')
    await fs.writeFile(p, content)
    return p
  }

  const findTar = (tars, channel) => tars.find(t => path.basename(t).includes(`.${channel}.`))

  // --- resolveManifest ---

  test('resolveManifest replaces ${{VAR}} from env', () => {
    const resolved = resolveManifest(
      {token: '${{GH_TOKEN}}', registry: '${{NPM_REGISTRY}}', name: 'pkg', version: '1.0.0'},
      {GH_TOKEN: 'secret-tok', NPM_REGISTRY: 'https://registry.npmjs.org'},
    )
    expect(resolved.token).toBe('secret-tok')
    expect(resolved.registry).toBe('https://registry.npmjs.org')
    expect(resolved.name).toBe('pkg')
  })

  test('resolveManifest: missing vars → empty string, non-strings preserved', () => {
    const resolved = resolveManifest({token: '${{MISSING}}', count: 42, flag: null}, {})
    expect(resolved.token).toBe('')
    expect(resolved.count).toBe(42)
    expect(resolved.flag).toBe(null)
  })

  test('resolveManifest handles multiple placeholders in one string', () => {
    const resolved = resolveManifest({url: 'https://${{USER}}:${{PASS}}@host'}, {USER: 'admin', PASS: 'secret'})
    expect(resolved.url).toBe('https://admin:secret@host')
  })

  // --- tar round-trip ---

  test('tar round-trip preserves manifest and files', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeFile(path.join(dir, 'data.txt'), 'payload')
    await packTar(path.join(dir, 'test.tar'), {key: 'value', n: 42}, [{name: 'data.txt', source: path.join(dir, 'data.txt')}])
    const {manifest} = await unpackTar(path.join(dir, 'test.tar'), path.join(dir, 'out'))
    expect(manifest.key).toBe('value')
    expect(await fs.readFile(path.join(dir, 'out/data.txt'), 'utf8')).toBe('payload')
  })

  test('tar round-trip preserves directory trees', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.ensureDir(path.join(dir, 'src/sub'))
    await fs.writeFile(path.join(dir, 'src/a.txt'), 'aaa')
    await fs.writeFile(path.join(dir, 'src/sub/b.txt'), 'bbb')
    await packTar(path.join(dir, 'tree.tar'), {ok: true}, [{name: 'src', source: path.join(dir, 'src')}])
    const {manifest} = await unpackTar(path.join(dir, 'tree.tar'), path.join(dir, 'out'))
    expect(manifest.ok).toBe(true)
    expect(await fs.readFile(path.join(dir, 'out/src/sub/b.txt'), 'utf8')).toBe('bbb')
  })

  // --- deliver: credential resolution ---

  test('deliver resolves template credentials and calls channel.run', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const tarPath = path.join(dir, 'test.npm.tar')
      await packTar(tarPath, {
        channel: 'npm', name: 'test-pkg', version: '1.0.1',
        registry: '${{NPM_REGISTRY}}', token: '${{NPM_TOKEN}}',
      }, [{name: 'package.tgz', source: await writeTmpFile('fake-tarball')}])

      const received = []
      const origRun = channels.npm.run
      channels.npm.run = async (manifest, dir) => received.push({manifest, dir})

      await deliver([tarPath], {NPM_REGISTRY: 'https://my-registry.com', NPM_TOKEN: 'tok-123', PATH: process.env.PATH})

      channels.npm.run = origRun
      expect(received.length).toBe(1)
      expect(received[0].manifest.registry).toBe('https://my-registry.com')
      expect(received[0].manifest.token).toBe('tok-123')
      expect(await fs.pathExists(path.join(received[0].dir, 'package.tgz'))).toBeTruthy()
    })
  })

  test('deliver builds repoAuthedUrl from repoHost + env token', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const tarPath = path.join(dir, 'test.meta.tar')
      await packTar(tarPath, {
        channel: 'meta', name: 'pkg', version: '1.0.0', tag: 'v1',
        type: 'commit', data: {foo: 1},
        repoHost: 'github.com', repoName: 'org/repo',
        originUrl: 'https://github.com/org/repo.git',
        gitCommitterEmail: 'b@b.com', gitCommitterName: 'Bot',
      })

      const received = []
      const origRun = channels.meta.run
      channels.meta.run = async (manifest, dir) => received.push({manifest, dir})
      await deliver([tarPath], {GH_TOKEN: 'ghp_secret', PATH: process.env.PATH})
      channels.meta.run = origRun

      expect(received[0].manifest.repoAuthedUrl).toBe('https://x-access-token:ghp_secret@github.com/org/repo.git')
      expect(received[0].manifest.ghBasicAuth).toBe('x-access-token:ghp_secret')
    })
  })

  test('deliver uses custom GH_USER in repoAuthedUrl', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const tarPath = path.join(dir, 'test.meta.tar')
      await packTar(tarPath, {
        channel: 'meta', name: 'pkg', version: '1.0.0', tag: 'v1',
        type: 'commit', data: {},
        repoHost: 'github.com', repoName: 'org/repo',
        originUrl: 'https://github.com/org/repo.git',
        gitCommitterEmail: 'b@b.com', gitCommitterName: 'Bot',
      })

      const received = []
      const origRun = channels.meta.run
      channels.meta.run = async (manifest, dir) => received.push({manifest, dir})
      await deliver([tarPath], {GH_TOKEN: 'tok', GH_USER: 'mybot', PATH: process.env.PATH})
      channels.meta.run = origRun

      expect(received[0].manifest.repoAuthedUrl).toBe('https://mybot:tok@github.com/org/repo.git')
    })
  })

  test('deliver falls back to originUrl when GH_TOKEN is missing', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const tarPath = path.join(dir, 'test.changelog.tar')
      await packTar(tarPath, {
        channel: 'changelog', releaseNotes: '# notes', branch: 'changelog', file: 'CHANGELOG.md',
        msg: 'chore: update', repoHost: 'github.com', repoName: 'org/repo',
        originUrl: 'https://github.com/org/repo.git',
        gitCommitterEmail: 'b@b.com', gitCommitterName: 'Bot',
      })

      const received = []
      const origRun = channels.changelog.run
      channels.changelog.run = async (manifest, dir) => received.push({manifest, dir})
      await deliver([tarPath], {PATH: process.env.PATH})
      channels.changelog.run = origRun

      expect(received[0].manifest.repoAuthedUrl).toBe('https://github.com/org/repo.git')
    })
  })

  test('deliver uses originUrl for local repos (no repoHost)', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const tarPath = path.join(dir, 'test.changelog.tar')
      await packTar(tarPath, {
        channel: 'changelog', releaseNotes: '# notes', branch: 'changelog', file: 'CHANGELOG.md',
        msg: 'chore: update', originUrl: '/tmp/bare-repo',
        gitCommitterEmail: 'b@b.com', gitCommitterName: 'Bot',
      })

      const received = []
      const origRun = channels.changelog.run
      channels.changelog.run = async (manifest, dir) => received.push({manifest, dir})
      await deliver([tarPath], {GH_TOKEN: 'tok', PATH: process.env.PATH})
      channels.changelog.run = origRun

      expect(received[0].manifest.repoAuthedUrl).toBe('/tmp/bare-repo')
    })
  })

  test('deliver skips tars with unknown channel', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const tarPath = path.join(dir, 'test.unknown.tar')
      await packTar(tarPath, {channel: 'unknown', foo: 'bar'})
      await deliver([tarPath], {PATH: process.env.PATH})
    })
  })

  test('deliver skips tars without channel field', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const tarPath = path.join(dir, 'test.tar')
      await packTar(tarPath, {foo: 'bar'})
      await deliver([tarPath], {PATH: process.env.PATH})
    })
  })

  // --- credentials never leak into parcels ---

  test('parcel manifests contain only template placeholders, never real values', () => {
    const pkg = makePkg({
      config: {
        ghToken: 'REAL_SECRET', npmToken: 'REAL_NPM',
        ghBasicAuth: 'user:REAL_SECRET', changelog: 'changelog',
        ghPages: 'gh-pages', meta: {type: 'commit'},
      },
    })
    const ctx = makeCtx()

    const parcels = buildParcels(pkg, ctx, {
      channels: ['npm', 'changelog', 'gh-pages', 'meta', 'gh-release'],
      repoHost: 'github.com', repoName: 'org/repo',
      originUrl: 'https://github.com/org/repo.git', releaseNotes: '## notes',
    })

    for (const {manifest} of parcels) {
      const json = JSON.stringify(manifest)
      expect(json.includes('REAL_SECRET')).toBeFalsy()
      expect(json.includes('REAL_NPM')).toBeFalsy()
    }

    const npm = parcels.find(p => p.channel === 'npm').manifest
    expect(npm.token).toBe('${{NPM_TOKEN}}')
    expect(npm.registry).toBe('${{NPM_REGISTRY}}')

    const ghr = parcels.find(p => p.channel === 'gh-release').manifest
    expect(ghr.token).toBe('${{GH_TOKEN}}')
  })

  // --- full pack → deliver round-trip ---

  test('pack → deliver round-trip: npm', async () => {
    await within(async () => {
      const mock = await setup([['npm pack', 'test-pkg-1.0.1.tgz']])
      const origSpawn = $.spawn
      $.spawn = (cmd, args) => {
        const command = args?.[args.length - 1] || cmd
        if (command.includes('npm pack')) {
          const m = command.match(/--pack-destination\s+(\S+)/)
          if (m) fs.writeFileSync(path.join(m[1], 'test-pkg-1.0.1.tgz'), 'fake-tarball-data')
        }
        return origSpawn(cmd, args)
      }
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const pkg = makePkg({version: '1.0.1', extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}', manifestAbsPath: `${tmpDir}/package.json`,
      }})
      const ctx = makeCtx({channels: ['npm'], flags: {}})
      pkg.ctx = ctx
      await pack(pkg, ctx)

      const received = []
      const origRun = channels.npm.run
      channels.npm.run = async (manifest, dir) => received.push({manifest, dir})
      await deliver(pkg.tars, {NPM_REGISTRY: 'https://my.registry', NPM_TOKEN: 'secret-npm-tok', PATH: process.env.PATH})
      channels.npm.run = origRun

      expect(received[0].manifest.channel).toBe('npm')
      expect(received[0].manifest.registry).toBe('https://my.registry')
      expect(received[0].manifest.token).toBe('secret-npm-tok')
      expect(await fs.pathExists(path.join(received[0].dir, 'package.tgz'))).toBeTruthy()
    })
  })

  test('pack → deliver round-trip: changelog', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)
      const pkg = makePkg({version: '1.0.1', extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}', manifestAbsPath: `${tmpDir}/package.json`,
      }})
      const ctx = makeCtx({channels: ['changelog'], flags: {}})
      pkg.ctx = ctx
      await pack(pkg, ctx)

      const received = []
      const origRun = channels.changelog.run
      channels.changelog.run = async (manifest, dir) => received.push({manifest, dir})
      await deliver(pkg.tars, {GH_TOKEN: 'ghp_test123', PATH: process.env.PATH})
      channels.changelog.run = origRun

      expect(received[0].manifest.channel).toBe('changelog')
      expect(received[0].manifest.releaseNotes).toBeTruthy()
      expect(received[0].manifest.repoAuthedUrl).toBe('https://x-access-token:ghp_test123@github.com/test-org/test-repo.git')
    })
  })

  test('pack → deliver round-trip: gh-pages with docs', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)
      await fs.ensureDir(path.join(tmpDir, 'packages/test-pkg/docs'))
      await fs.writeFile(path.join(tmpDir, 'packages/test-pkg/docs/index.html'), '<h1>hello</h1>')

      const pkg = makePkg({version: '1.0.1', extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}', manifestAbsPath: `${tmpDir}/package.json`,
      }})
      pkg.config.ghPages = 'gh-pages'
      const ctx = makeCtx({channels: ['gh-pages'], flags: {}})
      pkg.ctx = ctx
      await pack(pkg, ctx)

      const received = []
      const origRun = channels['gh-pages'].run
      channels['gh-pages'].run = async (manifest, dir) => received.push({manifest, dir})
      await deliver(pkg.tars, {GH_TOKEN: 'ghp_x', PATH: process.env.PATH})
      channels['gh-pages'].run = origRun

      expect(received[0].manifest.channel).toBe('gh-pages')
      expect(await fs.readFile(path.join(received[0].dir, 'docs/index.html'), 'utf8')).toBe('<h1>hello</h1>')
    })
  })

  test('pack → deliver round-trip: gh-release with assets', async () => {
    await within(async () => {
      await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)
      await fs.writeFile(path.join(tmpDir, 'packages/test-pkg/dist.bin'), 'binary-data')

      const pkg = makePkg({version: '1.0.1', extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}', manifestAbsPath: `${tmpDir}/package.json`,
      }})
      pkg.config.ghToken = 'tok'
      pkg.config.ghAssets = [{name: 'dist.bin', source: 'dist.bin'}]
      const ctx = makeCtx({channels: ['gh-release'], flags: {}})
      pkg.ctx = ctx
      await pack(pkg, ctx)

      const tar = findTar(pkg.tars, 'gh-release')
      const {manifest} = await unpackTar(tar, tempy.temporaryDirectory())
      expect(manifest.channel).toBe('gh-release')
      expect(manifest.token).toBe('${{GH_TOKEN}}')

      const received = []
      const origRun = channels['gh-release'].run
      channels['gh-release'].run = async (manifest, dir) => received.push({manifest, dir})
      await deliver(pkg.tars, {GH_TOKEN: 'real-token', GH_API_URL: gh.url, PATH: process.env.PATH})
      channels['gh-release'].run = origRun

      expect(received[0].manifest.token).toBe('real-token')
      expect(await fs.pathExists(path.join(received[0].dir, 'assets/dist.bin'))).toBeTruthy()
    })
  })

  test('pack → deliver round-trip: meta with originUrl fallback', async () => {
    await within(async () => {
      await setup([['git config --get remote.origin.url', '/tmp/local-bare-repo']])
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

      const pkg = makePkg({version: '1.0.1', extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}', manifestAbsPath: `${tmpDir}/package.json`,
      }})
      pkg.config.meta = {type: 'commit'}
      const ctx = makeCtx({channels: ['meta'], flags: {}})
      pkg.ctx = ctx
      await pack(pkg, ctx)

      const received = []
      const origRun = channels.meta.run
      channels.meta.run = async (manifest, dir) => received.push({manifest, dir})
      await deliver(pkg.tars, {GH_TOKEN: 'tok', PATH: process.env.PATH})
      channels.meta.run = origRun

      expect(received[0].manifest.repoAuthedUrl).toBe('/tmp/local-bare-repo')
    })
  })

  test('pack → deliver: multiple channels in one pass', async () => {
    await within(async () => {
      const mock = await setup([['npm pack', 'test-pkg-1.0.1.tgz']])
      const origSpawn = $.spawn
      $.spawn = (cmd, args) => {
        const command = args?.[args.length - 1] || cmd
        if (command.includes('npm pack')) {
          const m = command.match(/--pack-destination\s+(\S+)/)
          if (m) fs.writeFileSync(path.join(m[1], 'test-pkg-1.0.1.tgz'), 'tarball')
        }
        return origSpawn(cmd, args)
      }
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)
      await fs.ensureDir(path.join(tmpDir, 'packages/test-pkg/docs'))
      await fs.writeFile(path.join(tmpDir, 'packages/test-pkg/docs/readme.md'), '# Docs')

      const pkg = makePkg({version: '1.0.1', extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}', manifestAbsPath: `${tmpDir}/package.json`,
      }})
      pkg.config.ghToken = 'tok'
      pkg.config.ghPages = 'gh-pages'
      pkg.config.meta = {type: 'commit'}
      const ctx = makeCtx({channels: ['npm', 'gh-release', 'gh-pages', 'changelog', 'meta'], flags: {}})
      pkg.ctx = ctx
      await pack(pkg, ctx)

      expect(pkg.tars.length).toBe(5)
      // All tars in same staging directory
      expect(new Set(pkg.tars.map(t => path.dirname(t))).size).toBe(1)

      const received = {}
      const origRuns = {}
      for (const name of ['npm', 'gh-release', 'gh-pages', 'changelog', 'meta']) {
        origRuns[name] = channels[name].run
        channels[name].run = async (manifest, dir) => { received[name] = {manifest, dir} }
      }

      await deliver(pkg.tars, {
        GH_TOKEN: 'ghp_live', NPM_TOKEN: 'npm_live',
        NPM_REGISTRY: 'https://live.registry', GH_API_URL: gh.url, PATH: process.env.PATH,
      })

      for (const name of Object.keys(origRuns)) channels[name].run = origRuns[name]

      expect(received.npm.manifest.token).toBe('npm_live')
      expect(received['gh-release'].manifest.token).toBe('ghp_live')
      expect(received['gh-pages'].manifest.repoAuthedUrl.includes('ghp_live')).toBeTruthy()
      expect(received.changelog.manifest.releaseNotes).toBeTruthy()
      expect(received.meta.manifest.name).toBe('test-pkg')
    })
  })

  // --- deliver validation: warn and skip ---

  test('deliver skips parcels with missing credentials and logs warning', async () => {
    await within(async () => {
      await setup()
      const warnings = []
      $.report = {log() {}, warn(...args) { warnings.push(args.join(' ')) }}

      const dir = tempy.temporaryDirectory()
      const tarPath = path.join(dir, 'test.npm.tar')
      await packTar(tarPath, {channel: 'npm', name: 'pkg', version: '1.0.0', registry: '', token: '${{NPM_TOKEN}}'},
        [{name: 'package.tgz', source: await writeTmpFile('fake')}])

      const ran = []
      const origRun = channels.npm.run
      channels.npm.run = async () => ran.push('npm')

      await deliver([tarPath], {PATH: process.env.PATH})

      channels.npm.run = origRun
      expect(ran.length).toBe(0)
      expect(warnings.some(w => w.includes('missing credentials'))).toBeTruthy()
    })
  })

  test('deliver warns for each skipped parcel with missing credentials', async () => {
    await within(async () => {
      await setup()
      const warnings = []
      $.report = {log() {}, warn(...args) { warnings.push(args.join(' ')) }}

      const dir = tempy.temporaryDirectory()
      const npmTar = path.join(dir, 'npm.tar')
      await packTar(npmTar, {channel: 'npm', name: 'pkg', version: '1.0.0', token: '${{NPM_TOKEN}}'},
        [{name: 'package.tgz', source: await writeTmpFile('fake')}])
      const clTar = path.join(dir, 'cl.tar')
      await packTar(clTar, {channel: 'changelog', releaseNotes: '#', branch: 'cl', file: 'CL.md', msg: 'up',
        gitCommitterEmail: 'b@b.com', gitCommitterName: 'Bot'})

      const ran = []
      const origNpm = channels.npm.run
      const origCl = channels.changelog.run
      channels.npm.run = async () => ran.push('npm')
      channels.changelog.run = async () => ran.push('changelog')

      await deliver([npmTar, clTar], {PATH: process.env.PATH})

      channels.npm.run = origNpm
      channels.changelog.run = origCl
      expect(ran.length).toBe(0)
      expect(warnings.some(w => w.includes('npm.tar'))).toBeTruthy()
      expect(warnings.some(w => w.includes('cl.tar'))).toBeTruthy()
    })
  })

  // --- fetchRepo guard ---

  test('fetchRepo throws when both origin and cwd are missing', async () => {
    await within(async () => {
      await setup()
      const {fetchRepo} = await import(/* @vite-ignore */ `../../main/js/post/api/git.js?t=${Date.now()}`)
      try {
        await fetchRepo({branch: 'main'})
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e.message.includes('fetchRepo requires either origin or cwd')).toBeTruthy()
      }
    })
  })

  // --- directive-aware deliver ---

  const makeDirectiveTars = async (dir, {sha = 'abc1234567890', timestamp = 1700000000, queue, packages, parcels, prev = {}}) => {
    const sha7 = sha.slice(0, 7)
    const directiveTarName = `parcel.${sha7}.directive.${timestamp}.tar`
    const directiveTarPath = path.join(dir, directiveTarName)
    const directiveManifest = {
      channel: 'directive',
      sha,
      timestamp,
      queue,
      packages,
      parcels,
      prev,
    }
    await packTar(directiveTarPath, directiveManifest, [])

    const allTars = [directiveTarPath]
    for (const parcelName of parcels) {
      const channel = parcelName.replace(/\.tar$/, '').split('.')[2]
      const tarPath = path.join(dir, parcelName)
      const fakePkg = await writeTmpFile('fake-content')
      const files = channel === 'npm' ? [{name: 'package.tgz', source: fakePkg}] : []
      const pkgName = parcelName.replace(/\.tar$/, '').split('.')[3]
      const pkgVersion = parcelName.replace(/\.tar$/, '').split('.')[4]
      await packTar(tarPath, {
        channel,
        name: pkgName,
        version: pkgVersion,
        tag: `v${pkgVersion}-${pkgName}`,
        sha: sha,
        registry: channel === 'npm' ? '${{NPM_REGISTRY}}' : undefined,
        token: '${{GH_TOKEN}}',
        repoHost: 'github.com',
        repoName: 'org/repo',
        originUrl: 'https://github.com/org/repo.git',
        gitCommitterEmail: 'b@b.com',
        gitCommitterName: 'Bot',
      }, files)
      allTars.push(tarPath)
    }

    return allTars
  }

  test('deliver with directive: delivers parcels through channels', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const parcelName = 'parcel.abc1234.npm.pkg-a.1.0.1.aaa111.tar'
      const allTars = await makeDirectiveTars(dir, {
        queue: ['pkg-a'],
        packages: {
          'pkg-a': {
            version: '1.0.1',
            tag: '2026.1.1-pkg-a.1.0.1-f0',
            deliver: [['npm']],
            parcels: [parcelName],
          },
        },
        parcels: [parcelName],
      })

      const received = []
      const origRun = channels.npm.run
      channels.npm.run = async (manifest, dir) => received.push({manifest, dir})

      await deliver(allTars, {
        NPM_REGISTRY: 'https://test.registry', NPM_TOKEN: 'tok-npm',
        GH_TOKEN: 'ghp_test', PATH: process.env.PATH,
      })

      channels.npm.run = origRun

      expect(received.length).toBe(1)
      expect(received[0].manifest.channel).toBe('npm')
      expect(received[0].manifest.registry).toBe('https://test.registry')

      // parcel tar should be marked 'released'
      const parcelContent = await fs.readFile(path.join(dir, parcelName), 'utf8')
      expect(parcelContent).toBe('released')

      // directive tar should also be marked 'released'
      const directiveContent = await fs.readFile(allTars[0], 'utf8')
      expect(directiveContent).toBe('released')
    })
  })

  test('deliver with directive: conflict triggers rebuild signal', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const parcelName = 'parcel.abc1234.git-tag.pkg-a.1.0.1.bbb222.tar'
      const allTars = await makeDirectiveTars(dir, {
        queue: ['pkg-a'],
        packages: {
          'pkg-a': {
            version: '1.0.1',
            tag: '2026.1.1-pkg-a.1.0.1-f0',
            deliver: [['git-tag']],
            parcels: [parcelName],
          },
        },
        parcels: [parcelName],
      })

      const origRun = channels['git-tag'].run
      channels['git-tag'].run = async () => 'conflict'

      const result = await deliver(allTars, {GH_TOKEN: 'ghp_test', PATH: process.env.PATH})

      channels['git-tag'].run = origRun

      expect(result.conflicts.includes('pkg-a')).toBeTruthy()

      // parcel tar should be marked 'conflict'
      const parcelContent = await fs.readFile(path.join(dir, parcelName), 'utf8')
      expect(parcelContent).toBe('conflict')

      // directive tar should be marked 'conflict'
      const directiveContent = await fs.readFile(allTars[0], 'utf8')
      expect(directiveContent).toBe('conflict')
    })
  })

  test('deliver with directive: skips locked directive', async () => {
    await within(async () => {
      const mock = await setup([
        // Make tryLock's pushAnnotatedTag fail (simulating lock held by another process)
        [/git tag -a/, '', 1],
      ])
      const dir = tempy.temporaryDirectory()
      const parcelName = 'parcel.abc1234.npm.pkg-a.1.0.1.aaa111.tar'
      const allTars = await makeDirectiveTars(dir, {
        queue: ['pkg-a'],
        packages: {
          'pkg-a': {
            version: '1.0.1',
            tag: '2026.1.1-pkg-a.1.0.1-f0',
            deliver: [['npm']],
            parcels: [parcelName],
          },
        },
        parcels: [parcelName],
      })

      const received = []
      const origRun = channels.npm.run
      channels.npm.run = async (manifest, dir) => received.push({manifest, dir})

      await deliver(allTars, {GH_TOKEN: 'ghp_test', NPM_TOKEN: 'tok', NPM_REGISTRY: 'https://r', PATH: process.env.PATH})

      channels.npm.run = origRun

      // Nothing should have been delivered because lock was not acquired
      expect(received.length).toBe(0)

      // parcel tar should still be a valid tar (not overwritten)
      const parcelContent = await fs.readFile(path.join(dir, parcelName), 'utf8').catch(() => null)
      expect(parcelContent === 'released').toBeFalsy()
    })
  })

  test('deliver with directive: handles multiple packages in topo order', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const parcelA = 'parcel.abc1234.npm.pkg-a.1.0.1.aaa111.tar'
      const parcelB = 'parcel.abc1234.npm.pkg-b.1.0.2.bbb222.tar'
      const allTars = await makeDirectiveTars(dir, {
        queue: ['pkg-a', 'pkg-b'],
        packages: {
          'pkg-a': {
            version: '1.0.1',
            tag: '2026.1.1-pkg-a.1.0.1-f0',
            deliver: [['npm']],
            parcels: [parcelA],
          },
          'pkg-b': {
            version: '1.0.2',
            tag: '2026.1.1-pkg-b.1.0.2-f0',
            deliver: [['npm']],
            parcels: [parcelB],
          },
        },
        parcels: [parcelA, parcelB],
        prev: {'pkg-b': ['pkg-a']},
      })

      const deliveryOrder = []
      const origRun = channels.npm.run
      channels.npm.run = async (manifest, dir) => {
        deliveryOrder.push(manifest.name)
      }

      const result = await deliver(allTars, {
        NPM_REGISTRY: 'https://test.registry', NPM_TOKEN: 'tok',
        GH_TOKEN: 'ghp_test', PATH: process.env.PATH,
      })

      channels.npm.run = origRun

      expect(deliveryOrder.length).toBe(2)
      // pkg-a must be delivered before pkg-b (because pkg-b depends on pkg-a via prev)
      expect(deliveryOrder.indexOf('pkg-a') < deliveryOrder.indexOf('pkg-b')).toBe(true)
      expect(result.delivered).toBe(2)
    })
  })

  test('deliver with directive: dryRun does not write markers', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const parcelName = 'parcel.abc1234.npm.pkg-a.1.0.1.aaa111.tar'
      const allTars = await makeDirectiveTars(dir, {
        queue: ['pkg-a'],
        packages: {
          'pkg-a': {
            version: '1.0.1',
            tag: '2026.1.1-pkg-a.1.0.1-f0',
            deliver: [['npm']],
            parcels: [parcelName],
          },
        },
        parcels: [parcelName],
      })

      const origRun = channels.npm.run
      channels.npm.run = async () => {}

      await deliver(allTars, {
        NPM_REGISTRY: 'https://test.registry', NPM_TOKEN: 'tok',
        GH_TOKEN: 'ghp_test', PATH: process.env.PATH,
      }, {dryRun: true})

      channels.npm.run = origRun

      // parcel tar should NOT be overwritten with 'released' — it should still be a valid tar
      const parcelContent = await fs.readFile(path.join(dir, parcelName), 'utf8').catch(() => null)
      expect(parcelContent).not.toBe('released')
      expect(parcelContent).not.toBe('skip')
    })
  })

  test('deliverParcel: already-marked tar returns early', async () => {
    await within(async () => {
      await setup()
      const dir = tempy.temporaryDirectory()
      const tarPath = path.join(dir, 'parcel.abc1234.npm.pkg-a.1.0.1.aaa111.tar')
      await fs.ensureDir(dir)
      await fs.writeFile(tarPath, 'released')

      const received = []
      const origRun = channels.npm.run
      channels.npm.run = async (manifest, dir) => received.push({manifest, dir})

      // Use deliver with a directive that references this already-released parcel
      const directiveTarPath = path.join(dir, 'parcel.abc1234.directive.1700000000.tar')
      await packTar(directiveTarPath, {
        channel: 'directive',
        sha: 'abc1234567890',
        timestamp: 1700000000,
        queue: ['pkg-a'],
        packages: {
          'pkg-a': {
            version: '1.0.1',
            tag: '2026.1.1-pkg-a.1.0.1-f0',
            deliver: [['npm']],
            parcels: ['parcel.abc1234.npm.pkg-a.1.0.1.aaa111.tar'],
          },
        },
        parcels: ['parcel.abc1234.npm.pkg-a.1.0.1.aaa111.tar'],
        prev: {},
      }, [])

      await deliver([directiveTarPath, tarPath], {
        NPM_REGISTRY: 'https://test.registry', NPM_TOKEN: 'tok',
        GH_TOKEN: 'ghp_test', PATH: process.env.PATH,
      })

      channels.npm.run = origRun

      // Channel should NOT have been called since the parcel was already marked
      expect(received.length).toBe(0)

      // Tar should still contain 'released' (not overwritten)
      const content = await fs.readFile(tarPath, 'utf8')
      expect(content).toBe('released')
    })
  })

})
