import {describe, test, expect} from 'vitest'
import {$, within} from 'zx-extra'
import {createSpawnMock, defaultResponses} from './utils/mock.js'

describe('depot.exec', () => {
  test('exec runs templated command', async () => {
    await within(async () => {
      const mock = createSpawnMock([
        ...defaultResponses(),
        [/echo build-test-pkg/, 'built'],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false
      $.report = undefined

      const {exec} = await import(/* @vite-ignore */ `../../main/js/post/depot/exec.js?t=${Date.now()}`)

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
      expect(mock.calls.some(c => c.includes('echo build-test-pkg'))).toBeTruthy()
    })
  })

  test('exec skips when command is empty', async () => {
    await within(async () => {
      const mock = createSpawnMock(defaultResponses())
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false
      $.report = undefined

      const {exec} = await import(/* @vite-ignore */ `../../main/js/post/depot/exec.js?t=${Date.now()}`)

      const pkg = {
        name: 'test-pkg',
        absPath: '/tmp/test',
        ctx: {flags: {}, git: {sha: 'abc', root: '/tmp/test'}},
        config: {},
      }

      const result = await exec(pkg, 'buildCmd')
      expect(result).toBe(undefined)
    })
  })

})
