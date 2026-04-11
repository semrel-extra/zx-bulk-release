import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import changelog from '../../main/js/post/courier/channels/changelog.js'

const test = suite('channel.changelog')

test('when checks changelog config', () => {
  assert.is(changelog.when({config: {changelog: 'changelog'}}), true)
  assert.is(changelog.when({config: {}}), false)
  assert.is(changelog.name, 'changelog')
})

test.run()
