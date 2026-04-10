import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createMock, defaultResponses} from './utils/mock.js'

const test = suite('notes')

test('formatReleaseNotes generates markdown', async () => {
  await within(async () => {
    const mock = createMock(defaultResponses())
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()
    $.report = undefined

    const {formatReleaseNotes} = await import(`../../main/js/processor/generators/notes.js?t=${Date.now()}`)

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

test('interpolate replaces vars in URL template', async () => {
  const {interpolate} = await import('../../main/js/processor/generators/notes.js')
  const result = interpolate('https://github.com/${repo}/compare/${from}...${to}', {repo: 'foo/bar', from: 'v1', to: 'v2'})
  assert.is(result, 'https://github.com/foo/bar/compare/v1...v2')
})

test.run()
