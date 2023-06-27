import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {tempy, fs} from 'zx-extra'
import path from 'node:path'
import { ghPrepareAssets } from '../../main/js/gh.js'

const test = suite('gh')

test('`prepareAssets()` preprocesses files for publishing', async () => {
  const cwd = tempy.temporaryDirectory()
  await fs.outputFile(path.resolve(cwd, 'a.json'), '{"foo": "bar"}')
  await fs.outputFile(path.resolve(cwd, 'b.json'), '{"baz": "qux"}')

  const temp = await ghPrepareAssets([
    { name: 'jsons.zip', source: ['*.json'], zip: true, cwd},
    { name: 'a.zip', source: 'a.json', zip: true },
    { name: 'a.json', source: 'a.json', cwd },
  ], cwd)

  assert.equal(await fs.readFile(path.resolve(temp, 'a.json'), 'utf8'), '{"foo": "bar"}')
})

test.run()
