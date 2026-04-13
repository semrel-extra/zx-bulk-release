import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createSpawnMock, has} from './utils/mock.js'
import gitTag, {isTagConflict} from '../../main/js/post/courier/channels/git-tag.js'

const test = suite('channel.git-tag')

test('isTagConflict detects already exists', () => {
  assert.is(isTagConflict({message: 'error: tag already exists'}), true)
  assert.is(isTagConflict({stderr: 'updates were rejected'}), true)
  assert.is(isTagConflict({message: 'failed to push some refs'}), true)
  assert.is(isTagConflict({message: 'something else'}), false)
  assert.is(isTagConflict(null), false)
  assert.is(isTagConflict(undefined), false)
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

    assert.is(result, 'ok')
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
      assert.is(result, 'conflict')
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
      assert.unreachable('should throw')
    } catch (e) {
      assert.ok(e.message.includes('network timeout'))
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

    assert.is(result, 'ok')
    assert.ok(has(mock.calls, 'git fetch origin --depth 1'))
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

    assert.is(result, 'ok')
    assert.not.ok(has(mock.calls, 'git cat-file'), 'cat-file should not be called')
  })
})

test('when checks snapshot flag', () => {
  assert.is(gitTag.when({ctx: {flags: {snapshot: true}}}), false)
  assert.is(gitTag.when({ctx: {flags: {}}}), true)
  assert.is(gitTag.when({ctx: {}}), true)
  assert.is(gitTag.when({}), true)
})

test.run()
