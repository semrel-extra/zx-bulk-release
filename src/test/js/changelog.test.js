import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {interpolate, DIFF_TAG_URL, DIFF_COMMIT_URL} from '../../main/js/processor/notes.js'

const test = suite('changelog')

test('DIFF_TAG_URL produces github compare url', () => {
  const result = interpolate(DIFF_TAG_URL, {
    repoPublicUrl: 'https://github.com/org/repo',
    prevTag: 'v1.0.0',
    newTag: 'v1.1.0'
  })
  assert.is(result, 'https://github.com/org/repo/compare/v1.0.0...v1.1.0')
})

test('DIFF_COMMIT_URL produces github commit url', () => {
  const result = interpolate(DIFF_COMMIT_URL, {
    repoPublicUrl: 'https://github.com/org/repo',
    hash: 'abc123'
  })
  assert.is(result, 'https://github.com/org/repo/commit/abc123')
})

test('custom diffTagUrl for Gerrit', () => {
  const tpl = 'https://gerrit.foo.com/plugins/gitiles/${repoName}/+/refs/tags/${newTag}'
  const result = interpolate(tpl, {repoName: 'org/repo', newTag: 'v2.0.0'})
  assert.is(result, 'https://gerrit.foo.com/plugins/gitiles/org/repo/+/refs/tags/v2.0.0')
})

test('custom diffCommitUrl for Gerrit', () => {
  const tpl = 'https://gerrit.foo.com/plugins/gitiles/${repoName}/+/${hash}%5E%21'
  const result = interpolate(tpl, {repoName: 'org/repo', hash: 'deadbeef'})
  assert.is(result, 'https://gerrit.foo.com/plugins/gitiles/org/repo/+/deadbeef%5E%21')
})

test('interpolate() throws on invalid URL', () => {
  assert.throws(
    () => interpolate('not-a-url/${foo}', {foo: 'bar'}),
    /invalid URL after interpolation/
  )
})

test('interpolate() throws when missing vars produce broken URL', () => {
  assert.throws(
    () => interpolate('${base}/compare/${a}...${b}', {}),
    /invalid URL after interpolation/
  )
})

test.run()
