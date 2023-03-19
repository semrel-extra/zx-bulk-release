import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {topo} from '../../main/js/topo.js'

const test = suite('topo')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.resolve(__dirname, '../fixtures')

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
