import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createMock, has} from './utils/mock.js'

const test = suite('courier.semaphore')

// pushAnnotatedTag: git tag -a ${tag} -m ${message}, then git push origin ${tag}
// deleteRemoteTag: git push origin :refs/tags/${tag}

test('tryLock pushes annotated tag and returns true on success', async () => {
  await within(async () => {
    const mock = createMock([
      [/git tag -a/, ''],
      [/git push origin/, ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {tryLock} = await import(`../../main/js/post/courier/semaphore.js?t=${Date.now()}`)

    const result = await tryLock('/tmp/repo', {
      sha: 'abc1234567890',
      timestamp: '1700000000',
      queue: ['pkg-a'],
    })

    assert.is(result, true)
    assert.ok(has(mock.calls, 'zbr-deliver.abc1234'), 'tag name includes sha7')
  })
})

test('tryLock returns false when tag push fails', async () => {
  await within(async () => {
    // git tag -a succeeds but git push fails => error thrown => caught => return false
    const mock = createMock([
      [/git tag -a/, ''],
      [/git push origin/, '', 128],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {tryLock} = await import(`../../main/js/post/courier/semaphore.js?t=${Date.now()}`)

    const result = await tryLock('/tmp/repo', {
      sha: 'abc1234567890',
      timestamp: '1700000000',
      queue: ['pkg-a'],
    })

    assert.is(result, false)
  })
})

test('unlock deletes remote tag', async () => {
  await within(async () => {
    const mock = createMock([
      [/git push origin :refs\/tags/, ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {unlock} = await import(`../../main/js/post/courier/semaphore.js?t=${Date.now()}`)

    await unlock('/tmp/repo', {sha: 'abc1234567890'})

    assert.ok(has(mock.calls, 'git push origin :refs/tags'), 'delete tag was called')
    assert.ok(has(mock.calls, 'zbr-deliver.abc1234'), 'tag name is correct')
  })
})

test('signalRebuild pushes rebuild tag', async () => {
  await within(async () => {
    const mock = createMock([
      [/git tag -a/, ''],
      [/git push origin/, ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {signalRebuild} = await import(`../../main/js/post/courier/semaphore.js?t=${Date.now()}`)

    await signalRebuild('/tmp/repo', 'abc1234567890')

    assert.ok(has(mock.calls, 'zbr-rebuild.abc1234'), 'rebuild tag name is correct')
  })
})

test('consumeRebuildSignal deletes rebuild tag', async () => {
  await within(async () => {
    const mock = createMock([
      [/git push origin :refs\/tags/, ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {consumeRebuildSignal} = await import(`../../main/js/post/courier/semaphore.js?t=${Date.now()}`)

    await consumeRebuildSignal('/tmp/repo', 'abc1234567890')

    assert.ok(has(mock.calls, 'zbr-rebuild.abc1234'), 'rebuild tag deletion called')
  })
})

test.run()
