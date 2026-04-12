import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$} from 'zx-extra'
import {createRequire} from 'node:module'

const test = suite('cli')

test('prints own version', async () => {
  const require = createRequire(import.meta.url)
  const version = (await $`node ${require.resolve('../../main/js/cli.js')} --version`).toString().trim()
  const expected = require('../../../package.json').version
  assert.equal(version, expected)
})

test('--help shows usage', async () => {
  const require = createRequire(import.meta.url)
  const help = (await $`node ${require.resolve('../../main/js/cli.js')} --help`).toString()
  assert.ok(help.includes('--receive'))
  assert.ok(help.includes('--pack'))
  assert.ok(help.includes('--verify'))
  assert.ok(help.includes('--deliver'))
  assert.ok(help.includes('--dry-run'))
})

test.run()
