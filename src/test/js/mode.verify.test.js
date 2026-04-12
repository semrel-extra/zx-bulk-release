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

test('accepts valid parcels matching context', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  const outDir = tempy.temporaryDirectory()
  const sha = 'abc1234567890abcdef'
  const sha7 = sha.slice(0, 7)
  const tag = '2026.4.12-pkg.1.0.1-f0'

  const context = makeContext(sha, {
    pkg: {version: '1.0.1', tag, channels: ['npm', 'git-tag']},
  })
  const contextPath = path.join(dir, '.zbr-context.json')
  await fs.writeJson(contextPath, context)

  const npmTar = path.join(dir, `parcel.${sha7}.npm.${tag}.aaa111.tar`)
  const gitTagTar = path.join(dir, `parcel.${sha7}.git-tag.${tag}.bbb222.tar`)
  await packTar(npmTar, {channel: 'npm'})
  await packTar(gitTagTar, {channel: 'git-tag'})

  await runVerify({cwd: outDir, flags: {verify: dir, context: contextPath}})

  const copied = await glob(path.join(outDir, 'parcels', '*.tar'))
  assert.is(copied.length, 2)
})

test('rejects parcels with wrong sha', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  const sha = 'abc1234567890abcdef'
  const tag = '2026.4.12-pkg.1.0.1-f0'

  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
    pkg: {version: '1.0.1', tag, channels: ['npm']},
  }))

  await packTar(path.join(dir, `parcel.XXXXXXX.npm.${tag}.aaa111.tar`), {channel: 'npm'})

  try {
    await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('verification failed'))
  }
})

test('rejects parcels with unexpected channel', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  const sha = 'abc1234567890abcdef'
  const sha7 = sha.slice(0, 7)
  const tag = '2026.4.12-pkg.1.0.1-f0'

  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
    pkg: {version: '1.0.1', tag, channels: ['npm']},
  }))

  await packTar(path.join(dir, `parcel.${sha7}.gh-release.${tag}.aaa111.tar`), {channel: 'gh-release'})

  try {
    await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('verification failed'))
  }
})

test('rejects parcels with no matching package', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  const sha = 'abc1234567890abcdef'
  const sha7 = sha.slice(0, 7)

  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
    pkg: {version: '1.0.1', tag: '2026.4.12-pkg.1.0.1-f0', channels: ['npm']},
  }))

  await packTar(path.join(dir, `parcel.${sha7}.npm.2026.4.12-other.2.0.0-f0.aaa111.tar`), {channel: 'npm'})

  try {
    await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('verification failed'))
  }
})

test('passes directives through without package match', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  const outDir = tempy.temporaryDirectory()
  const sha = 'abc1234567890abcdef'
  const sha7 = sha.slice(0, 7)

  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {}))

  await packTar(path.join(dir, `parcel.${sha7}.directive.1700000000.tar`), {channel: 'directive'})

  await runVerify({cwd: outDir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})

  const copied = await glob(path.join(outDir, 'parcels', '*.tar'))
  assert.is(copied.length, 1)
  assert.ok(path.basename(copied[0]).includes('.directive.'))
})

test('does not confuse tag containing "directive" with actual directive', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  const outDir = tempy.temporaryDirectory()
  const sha = 'abc1234567890abcdef'
  const sha7 = sha.slice(0, 7)
  const tag = '2026.4.12-my.directive.pkg.1.0.1-f0'

  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
    'my-directive-pkg': {version: '1.0.1', tag, channels: ['npm']},
  }))

  // This is a regular npm parcel whose tag happens to contain "directive"
  await packTar(path.join(dir, `parcel.${sha7}.npm.${tag}.aaa111.tar`), {channel: 'npm'})

  await runVerify({cwd: outDir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})

  const copied = await glob(path.join(outDir, 'parcels', '*.tar'))
  assert.is(copied.length, 1)
  // It should be treated as a regular parcel (npm), not a directive
  assert.ok(path.basename(copied[0]).includes('.npm.'))
})

test('throws on missing context', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  try {
    await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'missing.json')}})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('no valid context'))
  }
})

test('no-op when no parcels exist', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext('abc1234567890', {}))

  await runVerify({cwd: dir, flags: {verify: dir, context: path.join(dir, 'ctx.json')}})
})

test('in-place verify does not duplicate files', async () => {
  const {runVerify} = await import(`../../main/js/post/modes/verify.js?t=${Date.now()}`)

  const dir = tempy.temporaryDirectory()
  const parcelsDir = path.join(dir, 'parcels')
  await fs.ensureDir(parcelsDir)

  const sha = 'abc1234567890abcdef'
  const sha7 = sha.slice(0, 7)
  const tag = '2026.4.12-pkg.1.0.1-f0'

  await fs.writeJson(path.join(dir, 'ctx.json'), makeContext(sha, {
    pkg: {version: '1.0.1', tag, channels: ['npm']},
  }))

  await packTar(path.join(parcelsDir, `parcel.${sha7}.npm.${tag}.aaa111.tar`), {channel: 'npm'})

  await runVerify({cwd: dir, flags: {verify: parcelsDir, context: path.join(dir, 'ctx.json')}})

  const tars = await glob(path.join(parcelsDir, '*.tar'))
  assert.is(tars.length, 1)
})

test.run()
