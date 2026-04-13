import {describe, test, expect} from 'vitest'
import {$} from 'zx-extra'

import {pushTag} from '../../main/js/post/api/git.js'
import {createFakeRepo} from './utils/repo.js'

describe('api.git', () => {
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
    expect(remoteTags.includes('1.0.0-test')).toBeTruthy()
  })

  test('pushTag() throws when tag already exists in remote', async () => {
    const cwd = await setupRepo()

    await pushTag({cwd, tag: '1.0.0-dup', gitCommitterName: 'Test', gitCommitterEmail: 'test@test.com'})

    try {
      await pushTag({cwd, tag: '1.0.0-dup', gitCommitterName: 'Test', gitCommitterEmail: 'test@test.com'})
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e.message.includes('already exists') || e.exitCode === 1).toBeTruthy()
    }
  })

})
