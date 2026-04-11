import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import meta from '../../main/js/post/courier/channels/meta.js'

const test = suite('channel.meta')

test('when checks meta.type config', () => {
  assert.is(meta.when({config: {meta: {type: 'commit'}}}), true)
  assert.is(meta.when({config: {meta: {type: null}}}), false)
  assert.is(meta.name, 'meta')
})

test.run()
