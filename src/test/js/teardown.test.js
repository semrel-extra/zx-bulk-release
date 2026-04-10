import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createMock, defaultResponses, makePkg, makeCtx, has} from './utils/mock.js'

const test = suite('teardown')

const setup = (responses = []) => {
  const mock = createMock([...defaultResponses(), ...responses])
  $.spawn = mock.spawn
  $.quiet = true
  $.verbose = false
  $.memo = new Map()
  $.report = undefined
  return mock
}

test('rollbackRelease calls undo on publishers in reverse', async () => {
  await within(async () => {
    const mock = setup()
    const {rollbackRelease} = await import(`../../main/js/processor/steps/teardown.js?t=${Date.now()}`)

    const undone = []
    const publishers = [
      {name: 'p1', when: () => true, undo: async () => undone.push('p1')},
      {name: 'p2', when: () => true, undo: async () => undone.push('p2')},
    ]

    const pkg = makePkg()
    const ctx = makeCtx({publishers, git: {sha: 'abc', root: '/tmp/fakerepo', tag: '2026.1.1-test-pkg.1.0.1-f0'}})
    pkg.ctx = ctx

    await rollbackRelease(pkg, ctx)

    assert.equal(undone, ['p2', 'p1'])
    assert.ok(has(mock.calls, 'git push origin :refs/tags/'))
  })
})

test('rollbackRelease skips when no tag', async () => {
  await within(async () => {
    setup()
    const {rollbackRelease} = await import(`../../main/js/processor/steps/teardown.js?t=${Date.now()}`)

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
    const {recover} = await import(`../../main/js/processor/steps/teardown.js?t=${Date.now()}`)

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
    const {recover} = await import(`../../main/js/processor/steps/teardown.js?t=${Date.now()}`)

    const pkg = makePkg({latest: {tag: null}})
    const ctx = makeCtx()
    pkg.ctx = ctx

    const result = await recover(pkg, ctx)
    assert.is(result, false)
  })
})

test.run()
