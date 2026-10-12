import {describe, test, expect} from 'vitest'
import {fs, path, tempy, glob} from 'zx-extra'
import tar from 'tar-stream'
import zlib from 'node:zlib'
import {pipeline} from 'node:stream/promises'
import {packTar, readNpmManifest} from '../../main/js/post/tar.js'
import {mergePopulate, verifyManifests, verifyParcels, sanitizePkgName} from '../../main/js/post/parcel/index.js'

describe('modes.verify', () => {
  const makeContext = (sha, packages) => ({
    status: 'proceed',
    sha,
    sha7: sha.slice(0, 7),
    packages,
  })

  const sha = 'abc1234567890abcdef'
  const sha7 = sha.slice(0, 7)

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

    await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
      pkg: {version: '1.0.1', channels: ['npm', 'git-tag']},
    }))
    await packTar(path.join(dir, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`), {channel: 'npm', name: 'pkg', version: '1.0.1'}, await npmTgz())
    await packTar(path.join(dir, `parcel.${sha7}.git-tag.pkg.1.0.1.bbb222.tar`), {channel: 'git-tag', name: 'pkg', version: '1.0.1'})

    await runVerify({cwd: outDir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})

    const copied = await glob(path.join(outDir, 'parcels', '*.tar'))
    expect(copied.length).toBe(2)
  })

  test('in-place verify does not duplicate files', async () => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)

    const dir = tempy.temporaryDirectory()
    const parcelsDir = path.join(dir, 'parcels')
    await fs.ensureDir(parcelsDir)

    await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
      pkg: {version: '1.0.1', channels: ['npm']},
    }))
    await packTar(path.join(parcelsDir, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`), {channel: 'npm', name: 'pkg', version: '1.0.1'}, await npmTgz())

    await runVerify({cwd: dir, flags: {verify: parcelsDir, context: path.join(dir, 'ctx.json')}})

    const tars = await glob(path.join(parcelsDir, '*.tar'))
    expect(tars.length).toBe(1)
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
  const verifyWith = async ({populate, embedded = populate, manifest, channel = manifest.channel, tag, timestamp, directive, files}) => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)
    const dir = tempy.temporaryDirectory()
    const outDir = tempy.temporaryDirectory()

    await fs.writeJson(path.join(dir, 'ctx.json'), {
      ...makeContext(sha, {pkg: {version: '1.0.1', channels: [channel], ...tag && {tag}, ...populate && {populate}}}),
      ...timestamp && {timestamp},
    })
    await packTar(path.join(dir, `parcel.${sha7}.${channel}.pkg.1.0.1.aaa111.tar`), {...manifest, ...embedded && {populate: embedded}},
      files || (manifest.channel === 'npm' ? await npmTgz() : []))
    if (directive) await packTar(path.join(dir, `parcel.${sha7}.directive.${directive.fileTs}.tar`), {channel: 'directive', sha, timestamp: directive.timestamp})
    await runVerify({cwd: outDir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})

    return glob(path.join(outDir, 'parcels', '*.tar'))
  }

  const npmManifest = {channel: 'npm', name: 'pkg', version: '1.0.1', token: '${{NPM_TOKEN}}', registry: '${{NPM_REGISTRY}}'}
  const tagManifest = {channel: 'git-tag', name: 'pkg', version: '1.0.1', tag: 'v1.0.1', sha}

  test('passes manifests that keep what the context fixed', async () => {
    expect((await verifyWith({manifest: npmManifest})).length).toBe(1)
    expect((await verifyWith({populate: strictPopulate(), manifest: tagManifest, tag: 'v1.0.1'})).length).toBe(1)
  })

  test('does not check the populate schemas: that is up to the courier', async () => {
    const manifest = {...npmManifest, registry: 'https://evil.example/'}
    expect((await verifyWith({populate: strictPopulate(), manifest})).length).toBe(1)
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
    expect((await verifyWith({manifest: npmManifest, files: await npmTgz([{name: 'pkg', version: '1.0.1'}], 'any-dir')})).length).toBe(1)
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
    expect(verifyParcels(honest, context).errors).toEqual([])
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

  test('skips delivery markers', async () => {
    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`)
    await fs.writeFile(tarPath, 'released')
    const context = makeContext(sha, {pkg: {version: '1.0.1', channels: ['npm'], populate: strictPopulate()}})

    expect(await verifyManifests([tarPath], context)).toEqual([])
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
