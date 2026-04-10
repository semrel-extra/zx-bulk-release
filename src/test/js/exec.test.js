import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createMock, defaultResponses} from './utils/mock.js'

const test = suite('exec')

test('exec runs templated command', async () => {
  await within(async () => {
    const mock = createMock([
      ...defaultResponses(),
      [/echo build-test-pkg/, 'built'],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.report = undefined

    const {exec} = await import(`../../main/js/processor/exec.js?t=${Date.now()}`)

    const pkg = {
      name: 'test-pkg',
      version: '1.0.0',
      absPath: '/tmp/test',
      ctx: {
        flags: {buildCmd: 'echo build-${{name}}'},
        config: {},
        git: {sha: 'abc123', root: '/tmp/test'},
      },
      config: {},
    }

    await exec(pkg, 'buildCmd')
    assert.ok(mock.calls.some(c => c.includes('echo build-test-pkg')))
  })
})

test('exec skips when command is empty', async () => {
  await within(async () => {
    const mock = createMock(defaultResponses())
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.report = undefined

    const {exec} = await import(`../../main/js/processor/exec.js?t=${Date.now()}`)

    const pkg = {
      name: 'test-pkg',
      absPath: '/tmp/test',
      ctx: {flags: {}, git: {sha: 'abc', root: '/tmp/test'}},
      config: {},
    }

    const result = await exec(pkg, 'buildCmd')
    assert.is(result, undefined)
  })
})

test.run()
