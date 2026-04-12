import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {fs, tempy} from 'zx-extra'
import {setOutput, isRebuildTrigger} from '../../main/js/post/api/gh.js'

const test = suite('api.gh')

test('setOutput writes name=value to GITHUB_OUTPUT file', () => {
  const file = tempy.temporaryFile()
  const orig = process.env.GITHUB_OUTPUT
  process.env.GITHUB_OUTPUT = file
  try {
    setOutput('status', 'proceed')
    setOutput('count', '3')
    const content = fs.readFileSync(file, 'utf8')
    assert.ok(content.includes('status=proceed\n'))
    assert.ok(content.includes('count=3\n'))
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
  assert.ok(isRebuildTrigger({GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'zbr-rebuild.abc1234'}))
})

test('isRebuildTrigger returns false for branch push', () => {
  assert.not.ok(isRebuildTrigger({GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'master'}))
})

test('isRebuildTrigger returns false for non-rebuild tag', () => {
  assert.not.ok(isRebuildTrigger({GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.0.0'}))
})

test('isRebuildTrigger returns false for empty env', () => {
  assert.not.ok(isRebuildTrigger({}))
})

test.run()
