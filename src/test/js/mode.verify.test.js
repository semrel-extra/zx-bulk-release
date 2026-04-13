import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {fs, path, tempy, glob} from 'zx-extra'
import {packTar} from '../../main/js/post/tar.js'

const test = suite('modes.verify')

const makeContext = (sha, packages) => ({
  status: 'proceed',
  sha,
  sha7: sha.slice(0, 7),
  packages,
})

const sha = 'abc1234567890abcdef'
const sha7 = sha.slice(0, 7)

test('copies verified parcels to output dir', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  const outDir = tempy.temporaryDirectory()

  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
    pkg: {version: '1.0.1', channels: ['npm', 'git-tag']},
  }))
  await packTar(path.join(dir, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`), {channel: 'npm'})
  await packTar(path.join(dir, `parcel.${sha7}.git-tag.pkg.1.0.1.bbb222.tar`), {channel: 'git-tag'})

  await runVerify({cwd: outDir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})

  const copied = await glob(path.join(outDir, 'parcels', '*.tar'))
  assert.is(copied.length, 2)
})

test('in-place verify does not duplicate files', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  const parcelsDir = path.join(dir, 'parcels')
  await fs.ensureDir(parcelsDir)

  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
    pkg: {version: '1.0.1', channels: ['npm']},
  }))
  await packTar(path.join(parcelsDir, `parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`), {channel: 'npm'})

  await runVerify({cwd: dir, flags: {verify: parcelsDir, context: path.join(dir, 'ctx.json')}})

  const tars = await glob(path.join(parcelsDir, '*.tar'))
  assert.is(tars.length, 1)
})

test('throws on missing context', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  try {
    await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'missing.json')}})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('context not found'))
  }
})

test('no-op when no parcels exist', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext('abc1234567890', {}))

  await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})
})

test('propagates verification errors as throw', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
    pkg: {version: '1.0.1', channels: ['npm']},
  }))
  await packTar(path.join(dir, `parcel.XXXXXXX.npm.pkg.1.0.1.aaa111.tar`), {channel: 'npm'})

  try {
    await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('verification failed'))
  }
})

test.run()
