import {describe, test, expect} from 'vitest'
import {$, within} from 'zx-extra'
import {createSpawnMock, has} from './utils/mock.js'
import gitTag, {isTagConflict} from '../../main/js/post/courier/channels/git-tag.js'

describe('channel.git-tag', () => {
  test('isTagConflict detects already exists', () => {
    expect(isTagConflict({message: 'error: tag already exists'})).toBe(true)
    expect(isTagConflict({stderr: 'updates were rejected'})).toBe(true)
    expect(isTagConflict({message: 'failed to push some refs'})).toBe(true)
    expect(isTagConflict({message: 'something else'})).toBe(false)
    expect(isTagConflict(null)).toBe(false)
    expect(isTagConflict(undefined)).toBe(false)
  })

  test('run returns ok on successful push', async () => {
    await within(async () => {
      const mock = createSpawnMock([
        ['git cat-file -e', '', 0],
        ['git config user.name', ''],
        ['git config user.email', ''],
        [/git tag -m/, ''],
        ['git push origin', ''],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false

      const result = await gitTag.run({
        tag: 'v1.0.0',
        sha: 'abc123',
        cwd: '/tmp/repo',
        gitCommitterName: 'Bot',
        gitCommitterEmail: 'bot@test.com',
      })

      expect(result).toBe('ok')
    })
  })

  test('run returns conflict when pushTag throws already exists', async () => {
    await within(async () => {
      const mock = createSpawnMock([
        ['git cat-file -e', '', 0],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false

      const {api} = await import('../../main/js/post/api/index.js')
      const origGit = api.git
      api.git = {...origGit, pushTag: async () => { throw new Error('error: tag already exists') }}

      try {
        const result = await gitTag.run({
          tag: 'v1.0.0', sha: 'abc123', cwd: '/tmp/repo',
        })
        expect(result).toBe('conflict')
      } finally {
        api.git = origGit
      }
    })
  })

  test('run rethrows non-conflict errors', async () => {
    await within(async () => {
      const mock = createSpawnMock([
        ['git cat-file -e', '', 0],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false

      const {api} = await import('../../main/js/post/api/index.js')
      const origGit = api.git
      api.git = {...origGit, pushTag: async () => { throw new Error('network timeout') }}

      try {
        await gitTag.run({
          tag: 'v1.0.0', sha: 'abc123', cwd: '/tmp/repo',
        })
        expect.unreachable('should throw')
      } catch (e) {
        expect(e.message.includes('network timeout')).toBeTruthy()
      } finally {
        api.git = origGit
      }
    })
  })

  test('ensureSha fetches when cat-file fails', async () => {
    await within(async () => {
      const mock = createSpawnMock([
        ['git cat-file -e', '', 1],  // sha not found locally
        ['git fetch origin --depth 1', ''],
        ['git config user.name', ''],
        ['git config user.email', ''],
        [/git tag -m/, ''],
        ['git push origin', ''],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false

      const result = await gitTag.run({
        tag: 'v1.0.0', sha: 'abc123', cwd: '/tmp/repo',
      })

      expect(result).toBe('ok')
      expect(has(mock.calls, 'git fetch origin --depth 1')).toBeTruthy()
    })
  })

  test('ensureSha skips fetch when no sha provided', async () => {
    await within(async () => {
      const mock = createSpawnMock([
        ['git config user.name', ''],
        ['git config user.email', ''],
        [/git tag -m/, ''],
        ['git push origin', ''],
      ])
      $.spawn = mock.spawn
      $.quiet = true
      $.verbose = false

      const result = await gitTag.run({
        tag: 'v1.0.0', cwd: '/tmp/repo',
      })

      expect(result).toBe('ok')
      expect(has(mock.calls, 'git cat-file')).toBeFalsy()
    })
  })

  test('when checks snapshot flag', () => {
    expect(gitTag.when({ctx: {flags: {snapshot: true}}})).toBe(false)
    expect(gitTag.when({ctx: {flags: {}}})).toBe(true)
    expect(gitTag.when({ctx: {}})).toBe(true)
    expect(gitTag.when({})).toBe(true)
  })

})
