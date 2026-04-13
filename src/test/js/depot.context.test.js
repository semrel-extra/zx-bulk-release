import {describe, test, expect} from 'vitest'
import {fs, path, tempy} from 'zx-extra'

describe('depot.context', () => {
  test('writeContext writes valid JSON', async () => {
    const {writeContext} = await import(/* @vite-ignore */ `../../main/js/post/depot/context.js?t=${Date.now()}`)
    const cwd = tempy.temporaryDirectory()
    const context = {status: 'proceed', sha: 'abc1234567890', sha7: 'abc1234', packages: {}}

    const filePath = await writeContext(cwd, context)

    expect(await fs.pathExists(filePath)).toBeTruthy()
    const data = await fs.readJson(filePath)
    expect(data.status).toBe('proceed')
    expect(data.sha).toBe('abc1234567890')
    expect(data.sha7).toBe('abc1234')
  })

  test('buildContext builds correct context from packages', async () => {
    const {buildContext} = await import(/* @vite-ignore */ `../../main/js/post/depot/context.js?t=${Date.now()}`)

    const packages = {
      a: {name: 'a', version: '1.0.1', tag: 'v1.0.1', releaseType: 'patch', skipped: false},
      b: {name: 'b', version: '2.0.0', tag: 'v2.0.0', releaseType: 'major', skipped: false},
    }
    const queue = ['a', 'b']
    const sha = 'deadbeef1234567'

    const result = buildContext(packages, queue, sha)

    expect(result.status).toBe('proceed')
    expect(result.sha).toBe('deadbeef1234567')
    expect(result.sha7).toBe('deadbee')
    expect(result.packages.a).toBeTruthy()
    expect(result.packages.b).toBeTruthy()
    expect(result.packages.a.version).toBe('1.0.1')
    expect(result.packages.b.version).toBe('2.0.0')
  })

  test('buildContext skips packages with no releaseType', async () => {
    const {buildContext} = await import(/* @vite-ignore */ `../../main/js/post/depot/context.js?t=${Date.now()}`)

    const packages = {
      a: {name: 'a', version: '1.0.1', tag: 'v1.0.1', releaseType: 'patch', skipped: false},
      b: {name: 'b', version: '2.0.0', tag: 'v2.0.0', releaseType: null, skipped: false},
    }
    const queue = ['a', 'b']
    const sha = 'deadbeef1234567'

    const result = buildContext(packages, queue, sha)

    expect(result.packages.a).toBeTruthy()
    expect(result.packages.b).toBeFalsy()
  })

  test('buildContext skips packages with skipped=true', async () => {
    const {buildContext} = await import(/* @vite-ignore */ `../../main/js/post/depot/context.js?t=${Date.now()}`)

    const packages = {
      a: {name: 'a', version: '1.0.1', tag: 'v1.0.1', releaseType: 'patch', skipped: true},
      b: {name: 'b', version: '2.0.0', tag: 'v2.0.0', releaseType: 'major', skipped: false},
    }
    const queue = ['a', 'b']
    const sha = 'deadbeef1234567'

    const result = buildContext(packages, queue, sha)

    expect(result.packages.a).toBeFalsy()
    expect(result.packages.b).toBeTruthy()
  })

  test('buildContext uses getChannels when provided', async () => {
    const {buildContext} = await import(/* @vite-ignore */ `../../main/js/post/depot/context.js?t=${Date.now()}`)

    const packages = {
      a: {name: 'a', version: '1.0.1', tag: 'v1.0.1', releaseType: 'patch', skipped: false},
    }
    const queue = ['a']
    const sha = 'deadbeef1234567'

    const result = buildContext(packages, queue, sha, {
      getChannels: (pkg) => ['npm', 'git-tag'],
    })

    expect(result.packages.a.channels).toEqual(['npm', 'git-tag'])
  })

  test('readContext throws on missing file', async () => {
    const {readContext} = await import(/* @vite-ignore */ `../../main/js/post/depot/context.js?t=${Date.now()}`)
    const fakePath = path.join(tempy.temporaryDirectory(), 'nonexistent.json')

    try {
      await readContext(fakePath)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e.message.includes('context not found')).toBeTruthy()
    }
  })

  test('readContext throws on missing status', async () => {
    const {readContext} = await import(/* @vite-ignore */ `../../main/js/post/depot/context.js?t=${Date.now()}`)
    const filePath = path.join(tempy.temporaryDirectory(), 'ctx.json')
    await fs.writeJson(filePath, {foo: 'bar'})

    try {
      await readContext(filePath)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e.message.includes('context missing status')).toBeTruthy()
    }
  })

  test('readContext validates proceed context', async () => {
    const {readContext} = await import(/* @vite-ignore */ `../../main/js/post/depot/context.js?t=${Date.now()}`)
    const filePath = path.join(tempy.temporaryDirectory(), 'ctx.json')
    await fs.writeJson(filePath, {status: 'proceed'})

    try {
      await readContext(filePath)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e.message.includes('context missing sha')).toBeTruthy()
    }
  })

  test('readContext returns valid context', async () => {
    const {readContext} = await import(/* @vite-ignore */ `../../main/js/post/depot/context.js?t=${Date.now()}`)
    const filePath = path.join(tempy.temporaryDirectory(), 'ctx.json')
    await fs.writeJson(filePath, {status: 'proceed', sha: 'abc', sha7: 'abc1234', packages: {}})

    const result = await readContext(filePath)
    expect(result.status).toBe('proceed')
    expect(result.sha).toBe('abc')
  })

})
