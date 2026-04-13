import {describe, test, expect} from 'vitest'
import {fs, tempy} from 'zx-extra'
import {setOutput, isRebuildTrigger} from '../../main/js/post/api/gh.js'

describe('api.gh', () => {
  test('setOutput writes name=value to GITHUB_OUTPUT file', () => {
    const file = tempy.temporaryFile()
    const orig = process.env.GITHUB_OUTPUT
    process.env.GITHUB_OUTPUT = file
    try {
      setOutput('status', 'proceed')
      setOutput('count', '3')
      const content = fs.readFileSync(file, 'utf8')
      expect(content.includes('status=proceed\n')).toBeTruthy()
      expect(content.includes('count=3\n')).toBeTruthy()
    } finally {
      if (orig === undefined) delete process.env.GITHUB_OUTPUT
      else process.env.GITHUB_OUTPUT = orig
    }
  })

  test('setOutput is a no-op when GITHUB_OUTPUT is unset', () => {
    const orig = process.env.GITHUB_OUTPUT
    delete process.env.GITHUB_OUTPUT
    try {
      setOutput('status', 'skip')
    } finally {
      if (orig !== undefined) process.env.GITHUB_OUTPUT = orig
    }
  })

  test('isRebuildTrigger detects zbr-rebuild tag', () => {
    expect(isRebuildTrigger({GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'zbr-rebuild.abc1234'})).toBeTruthy()
  })

  test('isRebuildTrigger returns false for branch push', () => {
    expect(isRebuildTrigger({GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'master'})).toBeFalsy()
  })

  test('isRebuildTrigger returns false for non-rebuild tag', () => {
    expect(isRebuildTrigger({GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.0.0'})).toBeFalsy()
  })

  test('isRebuildTrigger returns false for empty env', () => {
    expect(isRebuildTrigger({})).toBeFalsy()
  })

})
