import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createMock, defaultResponses, makePkg, makeCtx, has, tmpDir} from './utils/mock.js'

const test = suite('steps.misc')

const setup = (responses = []) => {
  const mock = createMock([...defaultResponses(), ...responses])
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
    const {contextify} = await import(`../../main/js/processor/steps/contextify.js?t=${Date.now()}`)

    const ctx = makeCtx()
    const pkg = makePkg()
    pkg.ctx = null

    await contextify(pkg, ctx)

    assert.ok(pkg.ctx)
    assert.is(pkg.ctx.git.sha, 'abc1234567890')
    assert.is(pkg.ctx.git.root, tmpDir)
    assert.ok(pkg.config)
  })
})

test('contextify is idempotent', async () => {
  await within(async () => {
    setup()
    const {contextify} = await import(`../../main/js/processor/steps/contextify.js?t=${Date.now()}`)

    const ctx = makeCtx()
    const pkg = makePkg()
    pkg.ctx = {already: 'set'}

    await contextify(pkg, ctx)
    assert.is(pkg.ctx.already, 'set')
  })
})

test('build runs buildCmd via exec', async () => {
  await within(async () => {
    const mock = setup()
    const {build} = await import(`../../main/js/processor/steps/build.js?t=${Date.now()}`)

    const ran = []
    const pkg = makePkg({extra: {manifest: {version: '1.0.1', private: false, name: 'test-pkg'}}})
    const ctx = makeCtx({run: async (p, name) => ran.push(name)})
    pkg.ctx = ctx
    ctx.packages = {[pkg.name]: pkg}

    await build(pkg, ctx)

    assert.ok(ran.includes('buildCmd'))
    assert.is(pkg.built, true)
  })
})

test('build skips buildCmd when fetched', async () => {
  await within(async () => {
    setup()
    const {build} = await import(`../../main/js/processor/steps/build.js?t=${Date.now()}`)

    const ran = []
    const pkg = makePkg({extra: {fetched: true, manifest: {version: '1.0.1', private: false, name: 'test-pkg'}}})
    const ctx = makeCtx({run: async (p, name) => ran.push(name)})
    pkg.ctx = ctx
    ctx.packages = {[pkg.name]: pkg}

    await build(pkg, ctx)

    assert.ok(!ran.includes('buildCmd'))
    assert.is(pkg.built, true)
  })
})

test('test runs testCmd via exec', async () => {
  await within(async () => {
    setup()
    const {test: testStep} = await import(`../../main/js/processor/steps/test.js?t=${Date.now()}`)

    const ran = []
    const pkg = makePkg()
    const ctx = makeCtx({run: async (p, name) => ran.push(name)})
    pkg.ctx = ctx

    await testStep(pkg, ctx)

    assert.ok(ran.includes('testCmd'))
    assert.is(pkg.tested, true)
  })
})

test('test skips testCmd when fetched', async () => {
  await within(async () => {
    setup()
    const {test: testStep} = await import(`../../main/js/processor/steps/test.js?t=${Date.now()}`)

    const ran = []
    const pkg = makePkg({extra: {fetched: true}})
    const ctx = makeCtx({run: async (p, name) => ran.push(name)})
    pkg.ctx = ctx

    await testStep(pkg, ctx)

    assert.ok(!ran.includes('testCmd'))
    assert.is(pkg.tested, true)
  })
})

test('clean calls unsetUserConfig', async () => {
  await within(async () => {
    const mock = setup()
    const {clean} = await import(`../../main/js/processor/steps/clean.js?t=${Date.now()}`)

    const pkg = makePkg({extra: {skipped: true}})
    await clean({cwd: '/tmp/fakerepo', packages: {[pkg.name]: pkg}})

    assert.ok(has(mock.calls, 'git config --unset'))
  })
})

test.run()
