import {describe, test, expect} from 'vitest'
import {$, within} from 'zx-extra'
import {createSpawnMock, has} from './utils/mock.js'

describe('courier.semaphore', () => {
  // pushAnnotatedTag: git tag -a ${tag} -m ${message}, then git push origin ${tag}
  // deleteRemoteTag: git push origin :refs/tags/${tag}

  test('tryLock pushes annotated tag and returns true on success', async () => {
    await within(async () => {
      const mock = createSpawnMock([
        [/git tag -a/, ''],
        [/git push origin/, ''],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false
      $.memo = new Map()

      const {tryLock} = await import(/* @vite-ignore */ `../../main/js/post/courier/semaphore.js?t=${Date.now()}`)

      const result = await tryLock('/tmp/repo', {
        sha: 'abc1234567890',
        timestamp: '1700000000',
        queue: ['pkg-a'],
      })

      expect(result).toBe(true)
      expect(has(mock.calls, 'zbr-deliver.abc1234')).toBeTruthy()
    })
  })

  test('tryLock returns false when tag push fails', async () => {
    await within(async () => {
      // git tag -a succeeds but git push fails => error thrown => caught => return false
      const mock = createSpawnMock([
        [/git tag -a/, ''],
        [/git push origin/, '', 128],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false
      $.memo = new Map()

      const {tryLock} = await import(/* @vite-ignore */ `../../main/js/post/courier/semaphore.js?t=${Date.now()}`)

      const result = await tryLock('/tmp/repo', {
        sha: 'abc1234567890',
        timestamp: '1700000000',
        queue: ['pkg-a'],
      })

      expect(result).toBe(false)
    })
  })

  test('unlock deletes remote tag', async () => {
    await within(async () => {
      const mock = createSpawnMock([
        [/git push origin :refs\/tags/, ''],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false
      $.memo = new Map()

      const {unlock} = await import(/* @vite-ignore */ `../../main/js/post/courier/semaphore.js?t=${Date.now()}`)

      await unlock('/tmp/repo', {sha: 'abc1234567890'})

      expect(has(mock.calls, 'git push origin :refs/tags')).toBeTruthy()
      expect(has(mock.calls, 'zbr-deliver.abc1234')).toBeTruthy()
    })
  })

  test('signalRebuild pushes rebuild tag', async () => {
    await within(async () => {
      const mock = createSpawnMock([
        [/git tag -a/, ''],
        [/git push origin/, ''],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false
      $.memo = new Map()

      const {signalRebuild} = await import(/* @vite-ignore */ `../../main/js/post/courier/semaphore.js?t=${Date.now()}`)

      await signalRebuild('/tmp/repo', 'abc1234567890')

      expect(has(mock.calls, 'zbr-rebuild.abc1234')).toBeTruthy()
    })
  })

  test('consumeRebuildSignal deletes rebuild tag', async () => {
    await within(async () => {
      const mock = createSpawnMock([
        [/git push origin :refs\/tags/, ''],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false
      $.memo = new Map()

      const {consumeRebuildSignal} = await import(/* @vite-ignore */ `../../main/js/post/courier/semaphore.js?t=${Date.now()}`)

      await consumeRebuildSignal('/tmp/repo', 'abc1234567890')

      expect(has(mock.calls, 'zbr-rebuild.abc1234')).toBeTruthy()
    })
  })

})
