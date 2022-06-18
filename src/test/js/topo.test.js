import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {fileURLToPath} from "node:url"
import path from 'node:path'
import {topo} from '@semrel-extra/topo'

const test = suite('topo')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.resolve(__dirname, '../fixtures')

test('topo returns pkg info and release queue', async () => {
  const {nodes, queue} = await topo({cwd: path.resolve(fixtures, 'regular-monorepo')})
  assert.equal(nodes, ['a', 'b', 'c', 'd'])
  assert.equal(queue, ['a', 'b', 'd', 'c'])
})

test.run()
