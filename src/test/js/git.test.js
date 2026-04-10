import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$} from 'zx-extra'

import {pushTag, deleteRemoteTag} from '../../main/js/processor/api/git.js'
import {createFakeRepo} from './utils/repo.js'

const test = suite('git')

const setupRepo = async () => {
  const cwd = await createFakeRepo({commits: [
    {
      msg: 'feat: initial',
      files: [{relpath: 'file.txt', contents: 'hello'}]
    }
  ]})
  await $({cwd})`git push origin HEAD`
  return cwd
}

test('pushTag() pushes a tag to remote', async () => {
  const cwd = await setupRepo()

  await pushTag({cwd, tag: '1.0.0-test', gitCommitterName: 'Test', gitCommitterEmail: 'test@test.com'})

  const remoteTags = (await $({cwd})`git ls-remote --tags origin`).toString()
  assert.ok(remoteTags.includes('1.0.0-test'))
})

test('pushTag() throws when tag already exists in remote', async () => {
  const cwd = await setupRepo()

  await pushTag({cwd, tag: '1.0.0-dup', gitCommitterName: 'Test', gitCommitterEmail: 'test@test.com'})

  try {
    await pushTag({cwd, tag: '1.0.0-dup', gitCommitterName: 'Test', gitCommitterEmail: 'test@test.com'})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('already exists') || e.exitCode === 1)
  }
})

test('deleteRemoteTag() removes tag from remote and local', async () => {
  const cwd = await setupRepo()

  await pushTag({cwd, tag: '1.0.0-del', gitCommitterName: 'Test', gitCommitterEmail: 'test@test.com'})

  // Verify tag exists
  let remoteTags = (await $({cwd})`git ls-remote --tags origin`).toString()
  assert.ok(remoteTags.includes('1.0.0-del'))

  await deleteRemoteTag({cwd, tag: '1.0.0-del'})

  // Verify tag removed from remote
  remoteTags = (await $({cwd})`git ls-remote --tags origin`).toString()
  assert.ok(!remoteTags.includes('1.0.0-del'))

  // Verify tag removed locally
  const localTags = (await $({cwd})`git tag -l`).toString()
  assert.ok(!localTags.includes('1.0.0-del'))
})

test('deleteRemoteTag() does not throw for non-existent tag', async () => {
  const cwd = await setupRepo()

  // Should not throw
  await deleteRemoteTag({cwd, tag: 'nonexistent-tag'})
})

test.run()
