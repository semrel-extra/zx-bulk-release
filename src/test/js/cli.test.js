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

test.run()
