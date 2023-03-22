import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {resolveNextVersion, topo} from '../../main/js/deps.js'

const test = suite('deps')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.resolve(__dirname, '../fixtures')

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

test('topo returns pkg info and release queue', async () => {
  const {nodes, queue} = await topo({cwd: path.resolve(fixtures, 'regular-monorepo')})
  assert.equal(nodes, ['a', 'b', 'c', 'd'])
  assert.equal(queue, ['a', 'b', 'd', 'c'])
})

test('topo applies pkg filter', async () => {
  const {queue, graphs, sources} = await topo({cwd: path.resolve(fixtures, 'regular-monorepo'), flags: {ignore: 'b,c'}})
  assert.equal(queue, ['a', 'd'])
  assert.equal(graphs, [{ nodes: new Set(['a', 'd']), sources: ['a']}])
  assert.equal(sources, ['a'])
})

test.run()
