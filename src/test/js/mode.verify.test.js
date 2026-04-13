import {describe, test, expect} from 'vitest'
import {fs, path, tempy, glob} from 'zx-extra'
import {packTar} from '../../main/js/post/tar.js'

describe('modes.verify', () => {
  const makeContext = (sha, packages) => ({
    status: 'proceed',
    sha,
    sha7: sha.slice(0, 7),
    packages,
  })

  const sha = 'abc1234567890abcdef'
  const sha7 = sha.slice(0, 7)

  test('copies verified parcels to output dir', async () => {
    const {runVerify} = await import(/* @vite-ignore */ `../../main/js/post/modes/verify.js?t=${Date.now()}`)

    const dir = tempy.temporaryDirectory()
    const outDir = tempy.temporaryDirectory()

    await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
      pkg: {version: '1.0.1', channels: ['npm', 'git-tag']},
    }))
    await packTar(path.join(dir, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`), {channel: 'npm'})
    await packTar(path.join(dir, `parcel.${sha7}.git-tag.pkg.1.0.1.bbb222.tar`), {channel: 'git-tag'})

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
    await packTar(path.join(parcelsDir, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`), {channel: 'npm'})

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
