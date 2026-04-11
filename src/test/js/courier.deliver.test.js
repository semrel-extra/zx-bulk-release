import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within, fs, path, tempy} from 'zx-extra'
import {createMock, defaultResponses, makePkg, makeCtx, has, tmpDir, gitResponses} from './utils/mock.js'
import {createGhServer} from './utils/gh-server.js'
import {channels, deliver, resolveTemplates, filterActive} from '../../main/js/post/courier/index.js'
import {buildParcel} from '../../main/js/post/courier/parcel.js'
import {packTar, unpackTar} from '../../main/js/post/tar.js'

const test = suite('courier.deliver')

const gh = await createGhServer()
test.after(() => gh.close())

const setup = async (responses = []) => {
  await fs.ensureDir(tmpDir)
  await fs.writeJson(`${tmpDir}/package.json`, {name: 'test-pkg', version: '1.0.1'}, {spaces: 2})
  Object.keys(gh.routes).forEach(k => delete gh.routes[k])
  gh.requests.length = 0
  const mock = createMock([...responses, ...defaultResponses()])
  $.spawn = mock.spawn
  $.quiet = true
  $.verbose = false
  $.memo = new Map()
  $.report = undefined
  return mock
}

// --- resolveTemplates ---

test('resolveTemplates replaces ${{VAR}} from env', () => {
  const manifest = {
    token: '${{GH_TOKEN}}',
    registry: '${{NPM_REGISTRY}}',
    name: 'pkg',
    version: '1.0.0',
  }
  const env = {GH_TOKEN: 'secret-tok', NPM_REGISTRY: 'https://registry.npmjs.org'}
  const resolved = resolveTemplates(manifest, env)

  assert.is(resolved.token, 'secret-tok')
  assert.is(resolved.registry, 'https://registry.npmjs.org')
  assert.is(resolved.name, 'pkg')
  assert.is(resolved.version, '1.0.0')
})

test('resolveTemplates replaces missing vars with empty string', () => {
  const resolved = resolveTemplates({token: '${{MISSING}}'}, {})
  assert.is(resolved.token, '')
})

test('resolveTemplates preserves non-string values', () => {
  const data = {count: 42, list: [1, 2], flag: null}
  const resolved = resolveTemplates(data, {})
  assert.is(resolved.count, 42)
  assert.equal(resolved.list, [1, 2])
  assert.is(resolved.flag, null)
})

test('resolveTemplates handles multiple placeholders in one string', () => {
  const resolved = resolveTemplates(
    {url: 'https://${{USER}}:${{PASS}}@host'},
    {USER: 'admin', PASS: 'secret'},
  )
  assert.is(resolved.url, 'https://admin:secret@host')
})

// --- tar round-trip: pack → unpack → verify ---

test('tar round-trip preserves manifest and files', async () => {
  const dir = tempy.temporaryDirectory()
  const srcFile = path.join(dir, 'data.txt')
  await fs.writeFile(srcFile, 'payload')

  const tarPath = path.join(dir, 'test.tar')
  await packTar(tarPath, {key: 'value', n: 42}, [{name: 'data.txt', source: srcFile}])

  const outDir = path.join(dir, 'out')
  const {manifest} = await unpackTar(tarPath, outDir)

  assert.is(manifest.key, 'value')
  assert.is(manifest.n, 42)
  assert.is(await fs.readFile(path.join(outDir, 'data.txt'), 'utf8'), 'payload')
})

test('tar round-trip preserves directory trees', async () => {
  const dir = tempy.temporaryDirectory()
  const nested = path.join(dir, 'src/sub')
  await fs.ensureDir(nested)
  await fs.writeFile(path.join(dir, 'src/a.txt'), 'aaa')
  await fs.writeFile(path.join(nested, 'b.txt'), 'bbb')

  const tarPath = path.join(dir, 'tree.tar')
  await packTar(tarPath, {ok: true}, [{name: 'src', source: path.join(dir, 'src')}])

  const outDir = path.join(dir, 'out')
  const {manifest} = await unpackTar(tarPath, outDir)

  assert.is(manifest.ok, true)
  assert.is(await fs.readFile(path.join(outDir, 'src/a.txt'), 'utf8'), 'aaa')
  assert.is(await fs.readFile(path.join(outDir, 'src/sub/b.txt'), 'utf8'), 'bbb')
})

// --- deliver: credential resolution ---

test('deliver resolves template credentials from env and calls channel.run', async () => {
  await within(async () => {
    await setup()
    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, 'test.npm.tar')

    // Build a fake npm tar with template manifest
    await packTar(tarPath, {
      name: 'test-pkg',
      version: '1.0.1',
      registry: '${{NPM_REGISTRY}}',
      token: '${{NPM_TOKEN}}',
      config: '${{NPM_CONFIG}}',
      provenance: '${{NPM_PROVENANCE}}',
      oidc: '${{NPM_OIDC}}',
      preversion: undefined,
    }, [{name: 'package.tgz', source: await writeTmpFile('fake-tarball')}])

    const received = []
    const origRun = channels.npm.run
    channels.npm.run = async (manifest, dir) => received.push({manifest, dir})

    await deliver({npm: tarPath}, {
      NPM_REGISTRY: 'https://my-registry.com',
      NPM_TOKEN: 'tok-123',
      NPM_CONFIG: '',
      NPM_PROVENANCE: '',
      NPM_OIDC: '',
      PATH: process.env.PATH,
    })

    channels.npm.run = origRun

    assert.is(received.length, 1)
    assert.is(received[0].manifest.registry, 'https://my-registry.com')
    assert.is(received[0].manifest.token, 'tok-123')
    assert.is(received[0].manifest.name, 'test-pkg')
    // package.tgz extracted into dir
    assert.ok(await fs.pathExists(path.join(received[0].dir, 'package.tgz')))
  })
})

test('deliver builds repoAuthedUrl from repoHost + env token', async () => {
  await within(async () => {
    await setup()
    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, 'test.meta.tar')

    await packTar(tarPath, {
      name: 'pkg', version: '1.0.0', tag: 'v1',
      type: 'commit', data: {foo: 1},
      repoHost: 'github.com', repoName: 'org/repo',
      originUrl: 'https://github.com/org/repo.git',
      gitCommitterEmail: 'b@b.com', gitCommitterName: 'Bot',
    })

    const received = []
    const origRun = channels.meta.run
    channels.meta.run = async (manifest, dir) => received.push({manifest, dir})

    await deliver({meta: tarPath}, {
      GH_TOKEN: 'ghp_secret',
      PATH: process.env.PATH,
    })

    channels.meta.run = origRun

    assert.is(received.length, 1)
    const m = received[0].manifest
    assert.is(m.repoAuthedUrl, 'https://x-access-token:ghp_secret@github.com/org/repo.git')
    assert.is(m.ghBasicAuth, 'x-access-token:ghp_secret')
  })
})

test('deliver uses custom GH_USER in repoAuthedUrl', async () => {
  await within(async () => {
    await setup()
    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, 'test.meta.tar')

    await packTar(tarPath, {
      name: 'pkg', version: '1.0.0', tag: 'v1',
      type: 'commit', data: {},
      repoHost: 'github.com', repoName: 'org/repo',
      originUrl: 'https://github.com/org/repo.git',
      gitCommitterEmail: 'b@b.com', gitCommitterName: 'Bot',
    })

    const received = []
    const origRun = channels.meta.run
    channels.meta.run = async (manifest, dir) => received.push({manifest, dir})

    await deliver({meta: tarPath}, {GH_TOKEN: 'tok', GH_USER: 'mybot', PATH: process.env.PATH})

    channels.meta.run = origRun

    assert.is(received[0].manifest.repoAuthedUrl, 'https://mybot:tok@github.com/org/repo.git')
  })
})

test('deliver falls back to originUrl when GH_TOKEN is missing', async () => {
  await within(async () => {
    await setup()
    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, 'test.changelog.tar')

    await packTar(tarPath, {
      releaseNotes: '# notes', branch: 'changelog', file: 'CHANGELOG.md',
      msg: 'chore: update',
      repoHost: 'github.com', repoName: 'org/repo',
      originUrl: 'https://github.com/org/repo.git',
      gitCommitterEmail: 'b@b.com', gitCommitterName: 'Bot',
    })

    const received = []
    const origRun = channels.changelog.run
    channels.changelog.run = async (manifest, dir) => received.push({manifest, dir})

    // No GH_TOKEN → repoAuthedUrl must fall back to originUrl
    await deliver({changelog: tarPath}, {PATH: process.env.PATH})

    channels.changelog.run = origRun

    assert.is(received.length, 1)
    assert.is(received[0].manifest.repoAuthedUrl, 'https://github.com/org/repo.git')
  })
})

test('deliver uses originUrl for local repos (no repoHost)', async () => {
  await within(async () => {
    await setup()
    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, 'test.changelog.tar')
    const bareOrigin = '/tmp/bare-repo'

    await packTar(tarPath, {
      releaseNotes: '# notes', branch: 'changelog', file: 'CHANGELOG.md',
      msg: 'chore: update',
      repoHost: undefined, repoName: undefined,
      originUrl: bareOrigin,
      gitCommitterEmail: 'b@b.com', gitCommitterName: 'Bot',
    })

    const received = []
    const origRun = channels.changelog.run
    channels.changelog.run = async (manifest, dir) => received.push({manifest, dir})

    await deliver({changelog: tarPath}, {GH_TOKEN: 'tok', PATH: process.env.PATH})

    channels.changelog.run = origRun

    assert.is(received.length, 1)
    // repoHost is missing → originUrl used directly
    assert.is(received[0].manifest.repoAuthedUrl, bareOrigin)
  })
})

test('deliver skips cmd channel', async () => {
  await within(async () => {
    await setup()
    const dir = tempy.temporaryDirectory()

    const received = []
    const origRun = channels.cmd.run
    channels.cmd.run = async (...args) => received.push(args)

    await deliver({cmd: path.join(dir, 'fake.tar')}, {PATH: process.env.PATH})

    channels.cmd.run = origRun
    assert.is(received.length, 0)
  })
})

test('deliver skips unknown channel names', async () => {
  await within(async () => {
    await setup()
    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, 'test.unknown.tar')
    await packTar(tarPath, {foo: 'bar'})

    // should not throw
    await deliver({unknown: tarPath}, {PATH: process.env.PATH})
  })
})

// --- credentials never leak into tar manifests ---

test('parcel manifests contain only template placeholders, never real values', () => {
  const pkg = makePkg({
    config: {
      ghToken: 'REAL_SECRET',
      npmToken: 'REAL_NPM',
      npmRegistry: 'https://real.registry',
      ghBasicAuth: 'user:REAL_SECRET',
      changelog: 'changelog',
      ghPages: 'gh-pages',
      meta: {type: 'commit'},
    },
  })
  const ctx = makeCtx()

  const parcel = buildParcel(pkg, ctx, {
    channels: ['npm', 'changelog', 'gh-pages', 'meta', 'gh-release'],
    repoHost: 'github.com',
    repoName: 'org/repo',
    originUrl: 'https://github.com/org/repo.git',
    releaseNotes: '## notes',
  })

  // npm: tokens are templates
  const npm = parcel.channels.npm.manifest
  assert.is(npm.token, '${{NPM_TOKEN}}')
  assert.is(npm.registry, '${{NPM_REGISTRY}}')
  assert.not.ok(JSON.stringify(npm).includes('REAL_SECRET'))
  assert.not.ok(JSON.stringify(npm).includes('REAL_NPM'))

  // gh-release: token is template
  const ghr = parcel.channels['gh-release'].manifest
  assert.is(ghr.token, '${{GH_TOKEN}}')
  assert.not.ok(JSON.stringify(ghr).includes('REAL_SECRET'))

  // changelog: no credentials at all
  const cl = parcel.channels.changelog.manifest
  assert.not.ok(JSON.stringify(cl).includes('REAL_SECRET'))
  assert.not.ok(JSON.stringify(cl).includes('ghBasicAuth'))

  // gh-pages: no credentials
  const ghp = parcel.channels['gh-pages'].manifest
  assert.not.ok(JSON.stringify(ghp).includes('REAL_SECRET'))

  // meta: no credentials
  const m = parcel.channels.meta.manifest
  assert.not.ok(JSON.stringify(m).includes('REAL_SECRET'))
})

// --- full pack → deliver round-trip ---

test('pack → deliver round-trip: npm channel receives resolved manifest + tarball', async () => {
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

    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkg({
      version: '1.0.1',
      extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}',
        manifestAbsPath: `${tmpDir}/package.json`,
      },
    })
    const ctx = makeCtx({channels: ['npm'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    // Now deliver: templates should resolve from env
    const received = []
    const origRun = channels.npm.run
    channels.npm.run = async (manifest, dir) => received.push({manifest, dir})

    await deliver(pkg.tars, {
      NPM_REGISTRY: 'https://my.registry',
      NPM_TOKEN: 'secret-npm-tok',
      PATH: process.env.PATH,
    })

    channels.npm.run = origRun

    assert.is(received.length, 1)
    assert.is(received[0].manifest.name, 'test-pkg')
    assert.is(received[0].manifest.version, '1.0.1')
    assert.is(received[0].manifest.registry, 'https://my.registry')
    assert.is(received[0].manifest.token, 'secret-npm-tok')
    assert.ok(await fs.pathExists(path.join(received[0].dir, 'package.tgz')))
  })
})

test('pack → deliver round-trip: changelog channel receives resolved repoAuthedUrl + notes', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkg({
      version: '1.0.1',
      extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}',
        manifestAbsPath: `${tmpDir}/package.json`,
      },
    })
    const ctx = makeCtx({channels: ['changelog'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)
    assert.ok(pkg.tars.changelog)

    const received = []
    const origRun = channels.changelog.run
    channels.changelog.run = async (manifest, dir) => received.push({manifest, dir})

    await deliver(pkg.tars, {
      GH_TOKEN: 'ghp_test123',
      PATH: process.env.PATH,
    })

    channels.changelog.run = origRun

    assert.is(received.length, 1)
    const m = received[0].manifest
    assert.ok(m.releaseNotes)
    assert.is(m.branch, 'changelog')
    assert.ok(m.file)
    assert.is(m.repoAuthedUrl, 'https://x-access-token:ghp_test123@github.com/test-org/test-repo.git')
    assert.is(m.ghBasicAuth, 'x-access-token:ghp_test123')
  })
})

test('pack → deliver round-trip: gh-pages channel receives docs from tar', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    // Create docs in package absPath
    const docsDir = path.join(tmpDir, 'packages/test-pkg/docs')
    await fs.ensureDir(docsDir)
    await fs.writeFile(path.join(docsDir, 'index.html'), '<h1>hello</h1>')
    await fs.writeFile(path.join(docsDir, 'style.css'), 'body{}')

    const pkg = makePkg({
      version: '1.0.1',
      extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}',
        manifestAbsPath: `${tmpDir}/package.json`,
      },
    })
    pkg.config.ghPages = 'gh-pages'
    const ctx = makeCtx({channels: ['gh-pages'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)
    assert.ok(pkg.tars['gh-pages'])

    const received = []
    const origRun = channels['gh-pages'].run
    channels['gh-pages'].run = async (manifest, dir) => received.push({manifest, dir})

    await deliver(pkg.tars, {GH_TOKEN: 'ghp_x', PATH: process.env.PATH})

    channels['gh-pages'].run = origRun

    assert.is(received.length, 1)
    const m = received[0].manifest
    assert.is(m.branch, 'gh-pages')
    assert.ok(m.repoAuthedUrl)
    // docs extracted from tar
    const html = await fs.readFile(path.join(received[0].dir, 'docs/index.html'), 'utf8')
    assert.is(html, '<h1>hello</h1>')
    const css = await fs.readFile(path.join(received[0].dir, 'docs/style.css'), 'utf8')
    assert.is(css, 'body{}')
  })
})

test('pack → deliver round-trip: gh-release channel receives assets from tar', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    // Create asset in package absPath
    const assetDir = path.join(tmpDir, 'packages/test-pkg')
    await fs.ensureDir(assetDir)
    await fs.writeFile(path.join(assetDir, 'dist.bin'), 'binary-data')

    gh.setRoutes({
      'POST /repos/test-org/test-repo/releases': (req, res) => {
        res.writeHead(201, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({id: 1, upload_url: `${gh.url}/uploads{?name}`}))
      },
      'POST /uploads': (req, res) => {
        res.writeHead(201, {'Content-Type': 'application/json'})
        res.end('{"id":2}')
      },
    })

    const pkg = makePkg({
      version: '1.0.1',
      extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}',
        manifestAbsPath: `${tmpDir}/package.json`,
      },
    })
    pkg.config.ghToken = 'tok'
    pkg.config.ghAssets = [{name: 'dist.bin', source: 'dist.bin'}]
    const ctx = makeCtx({channels: ['gh-release'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)
    assert.ok(pkg.tars['gh-release'])

    // Verify asset is packed into tar
    const {manifest, dir: tarDir} = await unpackTar(pkg.tars['gh-release'], tempy.temporaryDirectory())
    assert.is(manifest.token, '${{GH_TOKEN}}')
    assert.ok(await fs.pathExists(path.join(tarDir, 'assets/dist.bin')))
    assert.is(await fs.readFile(path.join(tarDir, 'assets/dist.bin'), 'utf8'), 'binary-data')

    // Deliver resolves token and channel reads from dir
    const received = []
    const origRun = channels['gh-release'].run
    channels['gh-release'].run = async (manifest, dir) => received.push({manifest, dir})

    await deliver(pkg.tars, {GH_TOKEN: 'real-token', GH_API_URL: gh.url, PATH: process.env.PATH})

    channels['gh-release'].run = origRun

    assert.is(received.length, 1)
    assert.is(received[0].manifest.token, 'real-token')
    assert.ok(await fs.pathExists(path.join(received[0].dir, 'assets/dist.bin')))
  })
})

test('pack → deliver round-trip: meta channel receives originUrl fallback', async () => {
  await within(async () => {
    // Simulate local bare repo: parseOrigin can't parse local paths
    await setup([
      ['git config --get remote.origin.url', '/tmp/local-bare-repo'],
    ])
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const pkg = makePkg({
      version: '1.0.1',
      extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}',
        manifestAbsPath: `${tmpDir}/package.json`,
      },
    })
    pkg.config.meta = {type: 'commit'}
    const ctx = makeCtx({channels: ['meta'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)
    assert.ok(pkg.tars.meta)

    // Verify originUrl is stored in manifest
    const {manifest} = await unpackTar(pkg.tars.meta, tempy.temporaryDirectory())
    assert.is(manifest.originUrl, '/tmp/local-bare-repo')
    // repoHost should be undefined for local paths
    assert.is(manifest.repoHost, undefined)

    const received = []
    const origRun = channels.meta.run
    channels.meta.run = async (manifest, dir) => received.push({manifest, dir})

    await deliver(pkg.tars, {GH_TOKEN: 'tok', PATH: process.env.PATH})

    channels.meta.run = origRun

    assert.is(received.length, 1)
    // originUrl used as repoAuthedUrl since repoHost is undefined
    assert.is(received[0].manifest.repoAuthedUrl, '/tmp/local-bare-repo')
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

    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const docsDir = path.join(tmpDir, 'packages/test-pkg/docs')
    await fs.ensureDir(docsDir)
    await fs.writeFile(path.join(docsDir, 'readme.md'), '# Docs')

    const pkg = makePkg({
      version: '1.0.1',
      extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}',
        manifestAbsPath: `${tmpDir}/package.json`,
      },
    })
    pkg.config.ghToken = 'tok'
    pkg.config.ghPages = 'gh-pages'
    pkg.config.meta = {type: 'commit'}
    const ctx = makeCtx({channels: ['npm', 'gh-release', 'gh-pages', 'changelog', 'meta'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    // All 5 channels should have tars
    assert.ok(pkg.tars.npm)
    assert.ok(pkg.tars['gh-release'])
    assert.ok(pkg.tars['gh-pages'])
    assert.ok(pkg.tars.changelog)
    assert.ok(pkg.tars.meta)

    // All tars live in the same staging directory
    const dirs = Object.values(pkg.tars).map(p => path.dirname(p))
    const uniqueDirs = [...new Set(dirs)]
    assert.is(uniqueDirs.length, 1, 'all tars should be in one staging directory')

    // Deliver all channels
    const received = {}
    const origRuns = {}
    for (const name of ['npm', 'gh-release', 'gh-pages', 'changelog', 'meta']) {
      origRuns[name] = channels[name].run
      channels[name].run = async (manifest, dir) => { received[name] = {manifest, dir} }
    }

    await deliver(pkg.tars, {
      GH_TOKEN: 'ghp_live',
      NPM_TOKEN: 'npm_live',
      NPM_REGISTRY: 'https://live.registry',
      GH_API_URL: gh.url,
      PATH: process.env.PATH,
    })

    for (const name of Object.keys(origRuns)) channels[name].run = origRuns[name]

    // npm
    assert.is(received.npm.manifest.token, 'npm_live')
    assert.is(received.npm.manifest.registry, 'https://live.registry')

    // gh-release
    assert.is(received['gh-release'].manifest.token, 'ghp_live')
    assert.ok(received['gh-release'].manifest.releaseNotes)

    // gh-pages
    assert.ok(received['gh-pages'].manifest.repoAuthedUrl.includes('ghp_live'))
    const doc = await fs.readFile(path.join(received['gh-pages'].dir, 'docs/readme.md'), 'utf8')
    assert.is(doc, '# Docs')

    // changelog
    assert.ok(received.changelog.manifest.repoAuthedUrl.includes('ghp_live'))
    assert.ok(received.changelog.manifest.releaseNotes)

    // meta
    assert.ok(received.meta.manifest.repoAuthedUrl.includes('ghp_live'))
    assert.is(received.meta.manifest.name, 'test-pkg')
  })
})

// --- fetchRepo guard ---

test('fetchRepo throws when both origin and cwd are missing', async () => {
  await within(async () => {
    await setup()
    const {fetchRepo} = await import(`../../main/js/post/api/git.js?t=${Date.now()}`)
    try {
      await fetchRepo({branch: 'main'})
      assert.unreachable('should have thrown')
    } catch (e) {
      assert.ok(e.message.includes('fetchRepo requires either origin or cwd'))
    }
  })
})

// --- helper ---

async function writeTmpFile(content) {
  const p = path.join(tempy.temporaryDirectory(), 'file')
  await fs.writeFile(p, content)
  return p
}

test.run()
