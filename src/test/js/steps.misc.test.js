import {describe, test, expect} from 'vitest'
import {$, within} from 'zx-extra'
import {createSpawnMock, defaultResponses, makePkg, makeCtx, has, tmpDir} from './utils/mock.js'

describe('steps.misc', () => {
  const setup = (responses = []) => {
    const mock = createSpawnMock([...defaultResponses(), ...responses])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()
    $.report = undefined
    return mock
  }

  test('contextify attaches ctx to pkg', async () => {
    await within(async () => {
      setup()
      const {contextify} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/contextify.js?t=${Date.now()}`)

      const ctx = makeCtx()
      const pkg = makePkg()
      pkg.ctx = null

      await contextify(pkg, ctx)

      expect(pkg.ctx).toBeTruthy()
      expect(pkg.ctx.git.sha).toBe('abc1234567890')
      expect(pkg.ctx.git.root).toBe(tmpDir)
      expect(pkg.config).toBeTruthy()
    })
  })

  test('contextify is idempotent', async () => {
    await within(async () => {
      setup()
      const {contextify} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/contextify.js?t=${Date.now()}`)

      const ctx = makeCtx()
      const pkg = makePkg()
      pkg.ctx = {already: 'set'}

      await contextify(pkg, ctx)
      expect(pkg.ctx.already).toBe('set')
    })
  })

  test('build runs buildCmd via exec', async () => {
    await within(async () => {
      const mock = setup()
      const {build} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/build.js?t=${Date.now()}`)

      const ran = []
      const pkg = makePkg({extra: {manifest: {version: '1.0.1', private: false, name: 'test-pkg'}}})
      const ctx = makeCtx({run: async (p, name) => ran.push(name)})
      pkg.ctx = ctx
      ctx.packages = {[pkg.name]: pkg}

      await build(pkg, ctx)

      expect(ran.includes('buildCmd')).toBeTruthy()
      expect(pkg.built).toBe(true)
    })
  })

  test('build skips buildCmd when fetched', async () => {
    await within(async () => {
      setup()
      const {build} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/build.js?t=${Date.now()}`)

      const ran = []
      const pkg = makePkg({extra: {fetched: true, manifest: {version: '1.0.1', private: false, name: 'test-pkg'}}})
      const ctx = makeCtx({run: async (p, name) => ran.push(name)})
      pkg.ctx = ctx
      ctx.packages = {[pkg.name]: pkg}

      await build(pkg, ctx)

      expect(ran.includes('buildCmd')).toBeFalsy()
      expect(pkg.built).toBe(true)
    })
  })

  test('test runs testCmd via exec', async () => {
    await within(async () => {
      setup()
      const {test: testStep} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/test.js?t=${Date.now()}`)

      const ran = []
      const pkg = makePkg()
      const ctx = makeCtx({run: async (p, name) => ran.push(name)})
      pkg.ctx = ctx

      await testStep(pkg, ctx)

      expect(ran.includes('testCmd')).toBeTruthy()
      expect(pkg.tested).toBe(true)
    })
  })

  test('test skips testCmd when fetched', async () => {
    await within(async () => {
      setup()
      const {test: testStep} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/test.js?t=${Date.now()}`)

      const ran = []
      const pkg = makePkg({extra: {fetched: true}})
      const ctx = makeCtx({run: async (p, name) => ran.push(name)})
      pkg.ctx = ctx

      await testStep(pkg, ctx)

      expect(ran.includes('testCmd')).toBeFalsy()
      expect(pkg.tested).toBe(true)
    })
  })

  test('clean calls unsetUserConfig', async () => {
    await within(async () => {
      const mock = setup()
      const {clean} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/clean.js?t=${Date.now()}`)

      const pkg = makePkg({extra: {skipped: true}})
      await clean({cwd: '/tmp/fakerepo', packages: {[pkg.name]: pkg}})

      expect(has(mock.calls, 'git config --unset')).toBeTruthy()
    })
  })

})
