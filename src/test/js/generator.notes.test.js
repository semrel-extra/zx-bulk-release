import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createMock, defaultResponses} from './utils/mock.js'
import {interpolate, DIFF_TAG_URL, DIFF_COMMIT_URL} from '../../main/js/post/depot/generators/notes.js'

const test = suite('generator.notes')

test('formatReleaseNotes generates markdown', async () => {
  await within(async () => {
    const mock = createMock(defaultResponses())
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()
    $.report = undefined

    const {formatReleaseNotes} = await import(`../../main/js/post/depot/generators/notes.js?t=${Date.now()}`)

    const pkg = {
      name: 'test-pkg',
      version: '1.0.1',
      absPath: '/tmp/fakerepo/packages/test-pkg',
      config: {ghBasicAuth: 'x:tok'},
      changes: [
        {group: 'Fixes & improvements', releaseType: 'patch', change: 'fix: bug', subj: 'fix: bug', short: 'abc1234', hash: 'abc1234full'},
        {group: 'Features', releaseType: 'minor', change: 'feat: new', subj: 'feat: new', short: 'def5678', hash: 'def5678full'},
      ],
      latest: {tag: {ref: 'v1.0.0'}},
    }

    const notes = await formatReleaseNotes(pkg)

    assert.ok(notes.includes('Fixes & improvements'))
    assert.ok(notes.includes('Features'))
    assert.ok(notes.includes('fix: bug'))
    assert.ok(notes.includes('feat: new'))
  })
})

test('interpolate replaces vars in URL template', () => {
  const result = interpolate('https://github.com/${repo}/compare/${from}...${to}', {repo: 'foo/bar', from: 'v1', to: 'v2'})
  assert.is(result, 'https://github.com/foo/bar/compare/v1...v2')
})

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
