import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import ghPages from '../../main/js/post/courier/channels/gh-pages.js'

const test = suite('channel.gh-pages')

test('when checks ghPages config', () => {
  assert.is(ghPages.when({config: {ghPages: 'gh-pages docs'}}), true)
  assert.is(ghPages.when({config: {}}), false)
  assert.is(ghPages.name, 'gh-pages')
})

test.run()
