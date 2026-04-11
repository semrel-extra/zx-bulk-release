import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createMock, defaultResponses, makePkg, makeCtx, has} from './utils/mock.js'
import {channels} from '../../main/js/post/courier/index.js'

const test = suite('steps.teardown')

const setup = (responses = []) => {
  const mock = createMock([...defaultResponses(), ...responses])
  $.spawn = mock.spawn
  $.quiet = true
  $.verbose = false
  $.memo = new Map()
  $.report = undefined
  return mock
}

const registerTestChannel = (name, impl) => {
  channels[name] = {name, ...impl}
  return () => { delete channels[name] }
}

test('rollbackRelease calls undo on publishers in reverse', async () => {
  await within(async () => {
    const mock = setup()
    const {rollbackRelease} = await import(`../../main/js/post/depot/steps/teardown.js?t=${Date.now()}`)

    const undone = []
    const c1 = registerTestChannel('p1', {when: () => true, undo: async () => undone.push('p1')})
    const c2 = registerTestChannel('p2', {when: () => true, undo: async () => undone.push('p2')})

    const pkg = makePkg()
    const ctx = makeCtx({channels: ['p1', 'p2'], git: {sha: 'abc', root: '/tmp/fakerepo', tag: '2026.1.1-test-pkg.1.0.1-f0'}})
    pkg.ctx = ctx

    await rollbackRelease(pkg, ctx)

    assert.equal(undone, ['p2', 'p1'])
    assert.ok(has(mock.calls, 'git push origin :refs/tags/'))

    c1(); c2()
  })
})

test('rollbackRelease skips when no tag', async () => {
  await within(async () => {
    setup()
    const {rollbackRelease} = await import(`../../main/js/post/depot/steps/teardown.js?t=${Date.now()}`)

    const pkg = makePkg()
    const ctx = makeCtx({git: {sha: 'abc', root: '/tmp/fakerepo', tag: undefined}})
    pkg.ctx = ctx

    await rollbackRelease(pkg, ctx)
    // should not throw
  })
})

test('recover returns false when pkg is not npm-published', async () => {
  await within(async () => {
    setup()
    const {recover} = await import(`../../main/js/post/depot/steps/teardown.js?t=${Date.now()}`)

    const pkg = makePkg({config: {npmPublish: false}, extra: {manifest: {private: true, version: '1.0.1', name: 'test-pkg'}}})
    const ctx = makeCtx()
    pkg.ctx = ctx

    const result = await recover(pkg, ctx)
    assert.is(result, false)
  })
})

test('recover returns false when no latest tag', async () => {
  await within(async () => {
    setup()
    const {recover} = await import(`../../main/js/post/depot/steps/teardown.js?t=${Date.now()}`)

    const pkg = makePkg({latest: {tag: null}})
    const ctx = makeCtx()
    pkg.ctx = ctx

    const result = await recover(pkg, ctx)
    assert.is(result, false)
  })
})

test.run()
