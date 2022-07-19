import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {resolveNextVersion} from '../../main/js/deps.js'

const test = suite('deps')

test('resolveNextVersion()', async () => {
  const cases = [
    [,,,null],
    ['^1.0', '2.0.0',, '2.0.0'],
    ['^1.0', '2.0.0', '2.0.0', null],
    ['^1.0', '2.0.0', '1.2.3', '2.0.0'],

    ['^1.0', '1.0.0',, '^1.0'],
    ['^1.0', '1.1.1',, '^1.0'],
    ['^1.0', '1.1.1', '^1.0', null],
    ['^1.0', '1.1.1', '^1.0.0', '^1.0'],

    ['workspace:^', '1.0.0',, '^1.0.0'],
    ['workspace:~', '1.0.0',, '~1.0.0'],
    ['workspace:*', '1.0.0',, '1.0.0'],
    ['workspace:*', '1.0.0', '1.0.0', null],
    ['workspace:^1.0', '1.1.1', '^1.0', null],
    ['workspace:1.0.0', '1.0.0',, '1.0.0'],
    ['workspace:^1.0', '2.0.0',, '2.0.0'],
  ]

  cases.forEach(([decl, actual, prev, expected]) => {
    assert.is(resolveNextVersion(decl, actual, prev), expected)
  })
})

test.run()