import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {fs, path, tempy} from 'zx-extra'

const test = suite('depot.context')

test('writeContext writes valid JSON', async () => {
  const {writeContext} = await import(`../../main/js/post/depot/context.js?t=${Date.now()}`)
  const cwd = tempy.temporaryDirectory()
  const context = {status: 'proceed', sha: 'abc1234567890', sha7: 'abc1234', packages: {}}

  const filePath = await writeContext(cwd, context)

  assert.ok(await fs.pathExists(filePath), 'file was created')
  const data = await fs.readJson(filePath)
  assert.is(data.status, 'proceed')
  assert.is(data.sha, 'abc1234567890')
  assert.is(data.sha7, 'abc1234')
})

test('buildContext builds correct context from packages', async () => {
  const {buildContext} = await import(`../../main/js/post/depot/context.js?t=${Date.now()}`)

  const packages = {
    a: {name: 'a', version: '1.0.1', tag: 'v1.0.1', releaseType: 'patch', skipped: false},
    b: {name: 'b', version: '2.0.0', tag: 'v2.0.0', releaseType: 'major', skipped: false},
  }
  const queue = ['a', 'b']
  const sha = 'deadbeef1234567'

  const result = buildContext(packages, queue, sha)

  assert.is(result.status, 'proceed')
  assert.is(result.sha, 'deadbeef1234567')
  assert.is(result.sha7, 'deadbee')
  assert.ok(result.packages.a, 'package a included')
  assert.ok(result.packages.b, 'package b included')
  assert.is(result.packages.a.version, '1.0.1')
  assert.is(result.packages.b.version, '2.0.0')
})

test('buildContext skips packages with no releaseType', async () => {
  const {buildContext} = await import(`../../main/js/post/depot/context.js?t=${Date.now()}`)

  const packages = {
    a: {name: 'a', version: '1.0.1', tag: 'v1.0.1', releaseType: 'patch', skipped: false},
    b: {name: 'b', version: '2.0.0', tag: 'v2.0.0', releaseType: null, skipped: false},
  }
  const queue = ['a', 'b']
  const sha = 'deadbeef1234567'

  const result = buildContext(packages, queue, sha)

  assert.ok(result.packages.a, 'package a included')
  assert.not.ok(result.packages.b, 'package b excluded (no releaseType)')
})

test('buildContext skips packages with skipped=true', async () => {
  const {buildContext} = await import(`../../main/js/post/depot/context.js?t=${Date.now()}`)

  const packages = {
    a: {name: 'a', version: '1.0.1', tag: 'v1.0.1', releaseType: 'patch', skipped: true},
    b: {name: 'b', version: '2.0.0', tag: 'v2.0.0', releaseType: 'major', skipped: false},
  }
  const queue = ['a', 'b']
  const sha = 'deadbeef1234567'

  const result = buildContext(packages, queue, sha)

  assert.not.ok(result.packages.a, 'package a excluded (skipped)')
  assert.ok(result.packages.b, 'package b included')
})

test('buildContext uses getChannels when provided', async () => {
  const {buildContext} = await import(`../../main/js/post/depot/context.js?t=${Date.now()}`)

  const packages = {
    a: {name: 'a', version: '1.0.1', tag: 'v1.0.1', releaseType: 'patch', skipped: false},
  }
  const queue = ['a']
  const sha = 'deadbeef1234567'

  const result = buildContext(packages, queue, sha, {
    getChannels: (pkg) => ['npm', 'git-tag'],
  })

  assert.equal(result.packages.a.channels, ['npm', 'git-tag'])
})

test('readContext throws on missing file', async () => {
  const {readContext} = await import(`../../main/js/post/depot/context.js?t=${Date.now()}`)
  const fakePath = path.join(tempy.temporaryDirectory(), 'nonexistent.json')

  try {
    await readContext(fakePath)
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('context not found'))
  }
})

test('readContext throws on missing status', async () => {
  const {readContext} = await import(`../../main/js/post/depot/context.js?t=${Date.now()}`)
  const filePath = path.join(tempy.temporaryDirectory(), 'ctx.json')
  await fs.writeJson(filePath, {foo: 'bar'})

  try {
    await readContext(filePath)
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('context missing status'))
  }
})

test('readContext validates proceed context', async () => {
  const {readContext} = await import(`../../main/js/post/depot/context.js?t=${Date.now()}`)
  const filePath = path.join(tempy.temporaryDirectory(), 'ctx.json')
  await fs.writeJson(filePath, {status: 'proceed'})

  try {
    await readContext(filePath)
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('context missing sha'))
  }
})

test('readContext returns valid context', async () => {
  const {readContext} = await import(`../../main/js/post/depot/context.js?t=${Date.now()}`)
  const filePath = path.join(tempy.temporaryDirectory(), 'ctx.json')
  await fs.writeJson(filePath, {status: 'proceed', sha: 'abc', sha7: 'abc1234', packages: {}})

  const result = await readContext(filePath)
  assert.is(result.status, 'proceed')
  assert.is(result.sha, 'abc')
})

test.run()
