import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {resolveVersion} from '../../main/js/deps.js'

const test = suite('deps')

test('resolveVersion()', async () => {
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
    assert.is(resolveVersion(decl, actual, prev), expected)
  })
})

test.run()