import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import changelog from '../../main/js/processor/publishers/changelog.js'

const test = suite('publisher.changelog')

test('when checks changelog config', () => {
  assert.is(changelog.when({config: {changelog: 'changelog'}}), true)
  assert.is(changelog.when({config: {}}), false)
  assert.is(changelog.name, 'changelog')
})

test.run()
