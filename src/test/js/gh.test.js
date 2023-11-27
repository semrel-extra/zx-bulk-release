import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {tempy, fs} from 'zx-extra'
import path from 'node:path'
import { ghPrepareAssets } from '../../main/js/api/gh.js'

const test = suite('gh')

test('`prepareAssets()` preprocesses files for publishing', async () => {
  const cwd = tempy.temporaryDirectory()
  await fs.outputFile(path.resolve(cwd, 'target/json/a.json'), '{"foo": "bar"}')
  await fs.outputFile(path.resolve(cwd, 'target/json/b.json'), '{"baz": "qux"}')
  await fs.outputFile(path.resolve(cwd, 'c.json'), '{"quuux": "quuux"}')
  await fs.outputFile(path.resolve(cwd, 'd.json'), '{"duuux": "duuux"}')

  const temp = await ghPrepareAssets([
    { name: 'jsons.zip', source: ['target/**/*.json'], zip: true, cwd},
    { name: 'a.zip', source: 'target/json/a.json', zip: true },
    { name: 'a.json', source: 'target/json/a.json', cwd },
    { name: 'c.json', source: 'c.json', cwd },
    { name: 'jsons2.zip', source: '*.json', cwd },
    { name: 'baz.txt', contents: 'baz' },
  ], cwd)

  assert.equal(await fs.readFile(path.resolve(temp, 'a.json'), 'utf8'), '{"foo": "bar"}')
  assert.equal(await fs.readFile(path.resolve(temp, 'c.json'), 'utf8'), '{"quuux": "quuux"}')
  assert.equal(await fs.readFile(path.resolve(temp, 'baz.txt'), 'utf8'), 'baz')
})

test.run()
