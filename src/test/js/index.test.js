import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {run} from '../../main/js/index.js'

const test = suite('index')

test('index has proper exports', () => {
  assert.instance(run, Function)
})

test.run()
