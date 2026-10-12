import {describe, test, expect} from 'vitest'
import {fs, path, tempy, glob} from 'zx-extra'
import tar from 'tar-stream'
import zlib from 'node:zlib'
import {pipeline} from 'node:stream/promises'
import {packTar, readNpmManifest, hashFile} from '../../main/js/post/tar.js'
import {mergePopulate, verifyManifests, verifyParcels, sanitizePkgName, buildParcels, buildDirective} from '../../main/js/post/parcel/index.js'
import {buildContext} from '../../main/js/post/depot/context.js'

describe('modes.verify', () => {
  const makeContext = (sha, packages) => ({
    status: 'proceed',
    sha,
    sha7: sha.slice(0, 7),
    packages,
  })

  const sha = 'abc1234567890abcdef'
  const sha7 = sha.slice(0, 7)

  // A directive as pack writes it: every context package with its parcels in the dir.
  const directiveFor = async (dir, context, {timestamp = context.timestamp, fileTs = timestamp ?? 1700000000, ...extra} = {}) => {
    const files = await fs.readdir(dir)
    const packages = Object.fromEntries(Object.entries(context.packages).map(([name, {version, tag, channels}]) =>
      [name, {version, tag, parcels: files.filter(f => channels.some(ch => f.startsWith(`parcel.${sha7}.${ch}.${sanitizePkgName(name)}.${version}.`)))}]))
    const file = path.join(dir, `parcel.${sha7}.directive.${fileTs}.tar`)
    await packTar(file, {channel: 'directive', sha, timestamp, queue: Object.keys(packages), packages, ...extra})
    return file
  }

  // an npm tarball as `npm pack` lays it out: package/package.json
  const npmTgz = async (packages = [{name: 'pkg', version: '1.0.1'}], dir = 'package') => {
    const pack = tar.pack()
    packages.forEach((json, i) => pack.entry({name: `${i ? `${dir}${i}` : dir}/package.json`}, JSON.stringify(json)))
    pack.finalize()
    const file = path.join(tempy.temporaryDirectory(), 'package.tgz')
    await pipeline(pack, zlib.createGzip(), fs.createWriteStream(file))
    return [{name: 'package.tgz', source: file}]
  }

  test('copies verified parcels to output dir', async () => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)

    const dir = tempy.temporaryDirectory()
    const outDir = tempy.temporaryDirectory()

    const context = makeContext(sha, {pkg: {version: '1.0.1', channels: ['npm', 'git-tag']}})
    await fs.writeJson(path.join(dir, 'ctx.json'), context)
    await packTar(path.join(dir, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`), {channel: 'npm', name: 'pkg', version: '1.0.1'}, await npmTgz())
    await packTar(path.join(dir, `parcel.${sha7}.git-tag.pkg.1.0.1.bbb222.tar`), {channel: 'git-tag', name: 'pkg', version: '1.0.1'})
    await directiveFor(dir, context)

    await runVerify({cwd: outDir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})

    const copied = await glob(path.join(outDir, 'parcels', '*.tar'))
    expect(copied.length).toBe(3)
  })

  test('in-place verify does not duplicate files', async () => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)

    const dir = tempy.temporaryDirectory()
    const parcelsDir = path.join(dir, 'parcels')
    await fs.ensureDir(parcelsDir)

    const context = makeContext(sha, {pkg: {version: '1.0.1', channels: ['npm']}})
    await fs.writeJson(path.join(dir, 'ctx.json'), context)
    await packTar(path.join(parcelsDir, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`), {channel: 'npm', name: 'pkg', version: '1.0.1'}, await npmTgz())
    await directiveFor(parcelsDir, context)

    await runVerify({cwd: dir, flags: {verify: parcelsDir, context: path.join(dir, 'ctx.json')}})

    const tars = await glob(path.join(parcelsDir, '*.tar'))
    expect(tars.length).toBe(2)
  })

  test('throws on missing context', async () => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)

    const dir = tempy.temporaryDirectory()
    try {
      await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'missing.json')}})
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e.message.includes('context not found')).toBeTruthy()
    }
  })

  test('no-op when no parcels exist', async () => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)

    const dir = tempy.temporaryDirectory()
    await fs.writeJson(path.join(dir, 'ctx.json'), makeContext('abc1234567890', {}))

    await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})
  })

  // --- manifest integrity ---

  const strictPopulate = () => mergePopulate({
    schemas:  {npmjs: {type: 'url', protocol: 'https:', hostname: 'registry.npmjs.org'}},
    channels: {npm: {registry: {schema: 'npmjs'}}},
  })

  // `embedded` — the rules pack put into the manifest, `populate` — the rules in the context
  // `directive` — what to change in the directive pack would write for the context
  const verifyWith = async ({populate, embedded = populate, manifest, channel = manifest.channel, tag, timestamp, directive = {}, files}) => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)
    const dir = tempy.temporaryDirectory()
    const outDir = tempy.temporaryDirectory()

    const context = {
      ...makeContext(sha, {pkg: {version: '1.0.1', channels: [channel], ...tag && {tag}, ...populate && {populate}}}),
      ...timestamp && {timestamp},
    }
    await fs.writeJson(path.join(dir, 'ctx.json'), context)
    await packTar(path.join(dir, `parcel.${sha7}.${channel}.pkg.1.0.1.aaa111.tar`), {...manifest, ...embedded && {populate: embedded}},
      files || (manifest.channel === 'npm' ? await npmTgz() : []))
    await directiveFor(dir, context, directive)
    await runVerify({cwd: outDir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})

    return glob(path.join(outDir, 'parcels', '*.tar'))
  }

  const npmManifest = {channel: 'npm', name: 'pkg', version: '1.0.1', token: '${{NPM_TOKEN}}', registry: '${{NPM_REGISTRY}}'}
  const tagManifest = {channel: 'git-tag', name: 'pkg', version: '1.0.1', tag: 'v1.0.1', sha}

  test('passes manifests that keep what the context fixed', async () => {
    expect((await verifyWith({manifest: npmManifest})).length).toBe(2)
    expect((await verifyWith({populate: strictPopulate(), manifest: tagManifest, tag: 'v1.0.1'})).length).toBe(2)
  })

  test('does not check the populate schemas: that is up to the courier', async () => {
    const manifest = {...npmManifest, registry: 'https://evil.example/'}
    expect((await verifyWith({populate: strictPopulate(), manifest})).length).toBe(2)
  })

  test('rejects a claim of another commit and a directive of another commit', async () => {
    const dir = tempy.temporaryDirectory()
    const context = makeContext(sha, {pkg: {version: '1.0.1', tag: 'v1.0.1', channels: ['git-tag']}})
    const tag = path.join(dir, `parcel.${sha7}.git-tag.pkg.1.0.1.aaa111.tar`)
    await packTar(tag, {...tagManifest, sha: 'f'.repeat(40)})
    const directive = await directiveFor(dir, context, {sha: 'f'.repeat(40)})

    expect(await verifyManifests([tag, directive], context)).toEqual([
      `manifest sha differs from the context: ${path.basename(tag)}`,
      `directive sha differs from the context: ${path.basename(directive)}`,
    ])
  })

  test('rejects an npm parcel that would go out under another dist-tag', async () => {
    const dir = tempy.temporaryDirectory()
    const version = `1.0.1-snap.${sha7}`
    const context = {...makeContext(sha, {pkg: {version, channels: ['npm']}}), snapshot: true}
    const npm = path.join(dir, `parcel.${sha7}.npm.pkg.${version}.aaa111.tar`)
    const files = await npmTgz([{name: 'pkg', version}])

    await packTar(npm, {channel: 'npm', name: 'pkg', version, preversion: version}, files)
    expect(await verifyManifests([npm], context)).toEqual([])
    await packTar(npm, {channel: 'npm', name: 'pkg', version}, files)
    expect(await verifyManifests([npm], context)).toEqual([`npm dist-tag differs from the context: ${path.basename(npm)}`])
  })

  test('rejects parcels whose embedded rules differ from the context', async () => {
    await expect(verifyWith({populate: strictPopulate(), embedded: mergePopulate(), manifest: npmManifest}))
      .rejects.toThrow('verification failed')
    await expect(verifyWith({embedded: strictPopulate(), manifest: npmManifest}))
      .rejects.toThrow('verification failed')
  })

  test('rejects a manifest whose channel differs from the parcel name', async () => {
    await expect(verifyWith({manifest: {...npmManifest, channel: 'changelog'}, channel: 'npm'}))
      .rejects.toThrow('verification failed')
  })

  test('rejects a manifest whose tag differs from the context', async () => {
    await expect(verifyWith({manifest: {...tagManifest, tag: 'v9.9.9'}, tag: 'v1.0.1'}))
      .rejects.toThrow('verification failed')
  })

  test('checks the directive timestamp against the commit time', async () => {
    const timestamp = 1700000000
    expect((await verifyWith({manifest: npmManifest, timestamp, directive: {timestamp, fileTs: timestamp}})).length).toBe(2)
    await expect(verifyWith({manifest: npmManifest, timestamp, directive: {timestamp: 1600000000, fileTs: timestamp}}))
      .rejects.toThrow('verification failed')
    await expect(verifyWith({manifest: npmManifest, timestamp, directive: {timestamp, fileTs: 1600000000}}))
      .rejects.toThrow('verification failed')
  })

  test('rejects a manifest with a __proto__ key', async () => {
    await expect(verifyWith({manifest: JSON.parse('{"channel": "git-tag", "name": "pkg", "version": "1.0.1", "__proto__": {"tag": "v6.6.6"}}'), tag: 'v1.0.1'}))
      .rejects.toThrow('verification failed')
  })

  test('rejects a manifest whose package or version differs from the parcel name', async () => {
    await expect(verifyWith({manifest: {...tagManifest, name: 'other'}, tag: 'v1.0.1'})).rejects.toThrow('verification failed')
    await expect(verifyWith({manifest: {...tagManifest, version: '9.9.9'}, tag: 'v1.0.1'})).rejects.toThrow('verification failed')
  })

  test('rejects an npm parcel whose tarball holds another package or version', async () => {
    await expect(verifyWith({manifest: npmManifest, files: await npmTgz([{name: 'depseek', version: '0.4.7'}])})).rejects.toThrow('verification failed')
    await expect(verifyWith({manifest: npmManifest, files: await npmTgz([{name: 'pkg', version: '0.0.1'}])})).rejects.toThrow('verification failed')
    expect((await verifyWith({manifest: npmManifest, files: await npmTgz([{name: 'pkg', version: '1.0.1'}], 'any-dir')})).length).toBe(2)
  })

  test('rejects an npm parcel without a readable, unambiguous tarball', async () => {
    await expect(verifyWith({manifest: npmManifest, files: []})).rejects.toThrow('verification failed')
    await expect(verifyWith({manifest: npmManifest, files: await npmTgz([{name: 'pkg', version: '1.0.1'}, {name: 'depseek', version: '0.4.7'}])}))
      .rejects.toThrow('verification failed')
  })

  test('tells apart packages whose names used to collide', async () => {
    const dir = tempy.temporaryDirectory()
    const context = makeContext(sha, {
      '@scope/pkg': {version: '1.0.0', channels: ['npm']},
      'scope-pkg':  {version: '1.0.0', channels: ['npm']},
    })
    const parcel = async (name, hash, tarball = name) => {
      const tarPath = path.join(dir, `parcel.${sha7}.npm.${sanitizePkgName(name)}.1.0.0.${hash}.tar`)
      await packTar(tarPath, {channel: 'npm', name, version: '1.0.0'}, await npmTgz([{name: tarball, version: '1.0.0'}]))
      return tarPath
    }

    const honest = [await parcel('@scope/pkg', 'aaa111'), await parcel('scope-pkg', 'bbb222')]
    expect(verifyParcels(honest, context).errors).toEqual(['expected one directive among the parcels, found 0'])
    expect(await verifyManifests(honest, context)).toEqual([])

    const swapped = await parcel('scope-pkg', 'ccc333', '@scope/pkg')
    expect(honest.map(t => path.basename(t))).toEqual([`parcel.${sha7}.npm.scope__pkg.1.0.0.aaa111.tar`, `parcel.${sha7}.npm.scope-pkg.1.0.0.bbb222.tar`])
    expect(await verifyManifests([swapped], context)).toEqual([
      `npm tarball "@scope/pkg@1.0.0" differs from the parcel name: parcel.${sha7}.npm.scope-pkg.1.0.0.ccc333.tar`,
    ])
  })

  test('readNpmManifest reads package.json from the tarball inside a parcel', async () => {
    const tarPath = path.join(tempy.temporaryDirectory(), 'parcel.tar')
    await packTar(tarPath, {channel: 'npm'}, await npmTgz([{name: 'depseek', version: '0.4.7'}]))
    expect(await readNpmManifest(tarPath)).toEqual({name: 'depseek', version: '0.4.7'})

    await packTar(tarPath, {channel: 'npm'})
    expect(await readNpmManifest(tarPath)).toBe(null)
  })

  test('verifyManifests names the parcel and the problem', async () => {
    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, `parcel.${sha7}.git-tag.pkg.1.0.1.aaa111.tar`)
    await packTar(tarPath, {...tagManifest, tag: 'v9.9.9'})
    const context = makeContext(sha, {pkg: {version: '1.0.1', tag: 'v1.0.1', channels: ['git-tag'], populate: strictPopulate()}})

    expect(await verifyManifests([tarPath], context)).toEqual([
      `manifest tag differs from the context: parcel.${sha7}.git-tag.pkg.1.0.1.aaa111.tar`,
      `populate rules differ from the context: parcel.${sha7}.git-tag.pkg.1.0.1.aaa111.tar`,
    ])
  })

  test('skips delivery markers: the courier asks the remote about the claims they stand for', async () => {
    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, `parcel.${sha7}.git-tag.pkg.1.0.1.aaa111.tar`)
    await fs.writeFile(tarPath, 'released')
    const context = makeContext(sha, {pkg: {version: '1.0.1', channels: ['git-tag']}})

    expect(await verifyManifests([tarPath], context)).toEqual([])
  })

  test('re-verifies a dir in place after a delivery, markers and all', async () => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)
    const dir = tempy.temporaryDirectory()
    const context = makeContext(sha, {pkg: {version: '1.0.1', tag: 'v1.0.1', channels: ['git-tag', 'npm']}})
    await fs.writeJson(path.join(dir, 'ctx.json'), context)
    await packTar(path.join(dir, `parcel.${sha7}.git-tag.pkg.1.0.1.aaa111.tar`), tagManifest)
    await packTar(path.join(dir, `parcel.${sha7}.npm.pkg.1.0.1.bbb222.tar`), npmManifest, await npmTgz())
    await directiveFor(dir, context)
    await fs.writeFile(path.join(dir, `parcel.${sha7}.git-tag.pkg.1.0.1.aaa111.tar`), 'released')

    await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})
  })

  test('verify takes plain files only, and leaves nothing unverified in the output dir', async () => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)
    const setup = async () => {
      const dir = tempy.temporaryDirectory()
      const context = makeContext(sha, {pkg: {version: '1.0.1', channels: ['npm']}})
      await fs.writeJson(path.join(dir, 'ctx.json'), context)
      await packTar(path.join(dir, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`), npmManifest, await npmTgz())
      await directiveFor(dir, context)
      return dir
    }
    const verify = (dir, out) => runVerify({cwd: out, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})

    const linked = await setup()
    const real = path.join(tempy.temporaryDirectory(), 'real.tar')
    await fs.move(path.join(linked, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`), real)
    await fs.symlink(real, path.join(linked, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`))
    await expect(verify(linked, tempy.temporaryDirectory())).rejects.toThrow('verification failed')

    const crowded = tempy.temporaryDirectory()
    await fs.outputFile(path.join(crowded, 'parcels', `parcel.${sha7}.npm.pkg.1.0.1.fff999.tar`), 'stale')
    await expect(verify(await setup(), crowded)).rejects.toThrow('verification failed')
  })

  test('the directive lists what the context fixed, and may hold packages back', async () => {
    const dir = tempy.temporaryDirectory()
    const context = {...makeContext(sha, {
      a: {version: '1.0.0', tag: 'a@1.0.0', channels: ['git-tag', 'npm']},
      b: {version: '2.0.0', tag: 'b@2.0.0', channels: ['git-tag']},
      c: {version: '3.0.0', tag: 'c@3.0.0', channels: ['git-tag']},
    }), prev: {b: ['a']}}
    const parcel = async (channel, name, version, hash) => {
      const file = `parcel.${sha7}.${channel}.${name}.${version}.${hash}.tar`
      await packTar(path.join(dir, file), {channel, name, version}, channel === 'npm' ? await npmTgz([{name, version}]) : [])
      return file
    }
    const aTag = await parcel('git-tag', 'a', '1.0.0', 'aaa111')
    const aNpm = await parcel('npm', 'a', '1.0.0', 'aaa222')
    const bTag = await parcel('git-tag', 'b', '2.0.0', 'bbb111')
    const cTag = await parcel('git-tag', 'c', '3.0.0', 'ccc111')
    const orphan = await parcel('npm', 'a', '1.0.0', 'ccc333') // an earlier build of the same commit
    const directive = `parcel.${sha7}.directive.1700000000.tar`
    const entry = (name, parcels, extra) => ({version: context.packages[name].version, tag: context.packages[name].tag, parcels, ...extra})
    const check = async (packages, extra) => {
      await packTar(path.join(dir, directive), {channel: 'directive', sha, queue: Object.keys(packages), prev: {b: ['a']}, packages, ...extra})
      return verifyManifests((await fs.readdir(dir)).map(f => path.join(dir, f)), context)
    }
    const at = (msg) => [`${msg}: ${directive}`]

    const ab = {a: entry('a', [aTag, aNpm]), b: entry('b', [bTag])}
    expect(await check(ab)).toEqual([]) // c held back, the orphan unlisted
    expect(await check({...ab, c: entry('c', [cTag])}, {prev: {b: ['a'], c: ['b']}})).toEqual([]) // an added wait
    expect(await check({})).toEqual(at('directive lists no packages'))
    expect(await check({...ab, 'x\n::error::': entry('a', [])})).toEqual(at('directive lists packages the context does not: "x\\n::error::"'))
    expect(await check(ab, {queue: ['a']})).toEqual(at('directive queue differs from its packages'))
    expect(await check(ab, {prev: {}})).toEqual(at('directive drops dependencies of b'))
    expect(await check({b: entry('b', [bTag])}, {prev: {}})).toEqual(at('directive holds back what b depend on'))
    expect(await check(ab, {prev: {a: ['b'], b: ['a']}})).toEqual(at('directive prev has a cycle'))
    expect(await check(ab, {prev: {b: 42}})).toEqual(at('directive prev names what the directive does not list'))
    expect(await check(ab, {prev: {b: ['a', 'c']}})).toEqual(at('directive prev names what the directive does not list'))
    expect(await check({a: entry('a', [aTag, aNpm], {version: '9.9.9'}), b: entry('b', [bTag])})).toEqual(at('directive entry of a differs from the context'))
    expect(await check({a: entry('a', 'x'), b: entry('b', [bTag])})).toEqual(at('directive entry of a has no parcel list'))

    const perChannel = at('directive does not list one verified parcel of a per channel (git-tag, npm)')
    expect(await check({a: entry('a', [aTag]), b: entry('b', [bTag])})).toEqual(perChannel)
    expect(await check({a: entry('a', [aTag, aNpm, orphan]), b: entry('b', [bTag])})).toEqual(perChannel)
    expect(await check({a: entry('a', [aTag, aNpm]), b: entry('b', [aTag])})).toEqual(at('directive does not list one verified parcel of b per channel (git-tag)'))
    expect(await check({a: entry('a', [aTag, aNpm]), b: entry('b', [`parcel.${sha7}.git-tag.b.2.0.0.fff999.tar`])}))
      .toEqual(at('directive does not list one verified parcel of b per channel (git-tag)'))
  })

  test('markers are where a courier leaves them, or nowhere', async () => {
    const dir = tempy.temporaryDirectory()
    const context = makeContext(sha, {pkg: {version: '1.0.1', tag: 'v1.0.1', channels: ['git-tag', 'npm']}})
    const tag = path.join(dir, `parcel.${sha7}.git-tag.pkg.1.0.1.aaa111.tar`)
    const npm = path.join(dir, `parcel.${sha7}.npm.pkg.1.0.1.bbb222.tar`)
    const reset = async () => {
      await packTar(tag, tagManifest)
      await packTar(npm, npmManifest, await npmTgz())
      return directiveFor(dir, context)
    }
    const directive = await reset()
    const verify = () => verifyManifests([tag, npm, directive], context)

    await fs.writeFile(tag, 'released')
    expect(await verify()).toEqual([]) // a partial delivery
    await fs.writeFile(npm, 'released')
    expect(await verify()).toEqual([]) // a delivery

    await reset()
    await fs.writeFile(npm, 'released')
    expect(await verify()).toEqual([`parcels of pkg are marked before its claim: ${path.basename(directive)}`])

    await reset()
    await fs.writeFile(npm, 'orphan')
    expect(await verify()).toEqual([`directive lists dropped parcels of pkg: ${path.basename(directive)}`])

    await reset()
    await fs.writeFile(directive, 'released')
    expect(await verify()).toEqual([`directive is marked released, yet parcels are left: ${path.basename(directive)}`])
  })

  // The contract itself: what receive fixes and pack writes, verify accepts.
  test('accepts what pack writes for the context receive wrote', async () => {
    const dir = tempy.temporaryDirectory()
    const timestamp = 1700000000
    const channels = ['git-tag', 'npm', 'meta', 'changelog']
    const packages = Object.fromEntries(['@scope/a', 'b'].map((name, i) => [name, {
      name, version: `1.${i}.0`, tag: `${name}@1.${i}.0`, releaseType: 'minor',
      config: {changelog: 'changelog', meta: {type: 'commit'}, gitCommitterName: 'Bot', gitCommitterEmail: 'bot@test.com'},
      meta: {META_VERSION: '1', name},
      ctx: {git: {sha, timestamp, root: dir}},
    }]))
    const prev = new Map([['b', ['@scope/a']]])
    const context = buildContext(packages, Object.keys(packages), sha, {getChannels: () => channels, getPopulate: () => mergePopulate(), timestamp, prev, snapshot: false})

    for (const pkg of Object.values(packages)) {
      const npmTarball = (await npmTgz([{name: pkg.name, version: pkg.version}]))[0].source
      const artifacts = {repoName: 'org/repo', repoHost: 'github.com', originUrl: 'https://github.com/org/repo.git', npmTarball, releaseNotes: '## notes'}
      pkg.tars = []
      for (const {channel, manifest, files} of buildParcels(pkg, pkg.ctx, {channels, ...artifacts})) {
        const tmp = path.join(tempy.temporaryDirectory(), 'parcel.tar')
        await packTar(tmp, manifest, files)
        const tarPath = path.join(dir, `parcel.${sha7}.${channel}.${sanitizePkgName(pkg.name)}.${pkg.version}.${await hashFile(tmp)}.tar`)
        await fs.move(tmp, tarPath)
        pkg.tars.push(tarPath)
      }
      pkg.activeTransport = channels
    }
    await buildDirective({prev}, Object.values(packages), dir)

    const tars = (await fs.readdir(dir)).map(f => path.join(dir, f))
    const {verified, errors} = verifyParcels(tars, context)
    expect(errors).toEqual([])
    expect(verified).toHaveLength(9)
    expect(await verifyManifests(verified, context)).toEqual([])
  })

  test('propagates verification errors as throw', async () => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)

    const dir = tempy.temporaryDirectory()
    await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
      pkg: {version: '1.0.1', channels: ['npm']},
    }))
    await packTar(path.join(dir, `parcel.XXXXXXX.npm.pkg.1.0.1.aaa111.tar`), {channel: 'npm'})

    try {
      await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e.message.includes('verification failed')).toBeTruthy()
    }
  })

})
