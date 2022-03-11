import {test} from 'uvu'
import * as assert from 'uvu/assert'

import {run} from '../../main/js/index.js'

test('index has proper exports', () => {
  assert.instance(run, Function)
})

test('run: dry-run', async () => {
  await run()
})

test.run()
