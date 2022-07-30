import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {tpl} from '../../main/js/util.js'

const test = suite('util')

test('tpl()', () => {
  const cases = [
    [
      'echo "custom publish: ${{name}} ${{ version }} ${{ context.foo.bar }}"',
      {
        name: 'foo',
        version: '1.0.0',
        context: {
          foo: {
            bar: 'baz'
          }
        }
      },
      'echo "custom publish: foo 1.0.0 baz"'],
    [
      'echo "custom publish: ${{name}} ${{version}}"',
      {},
      'echo "custom publish:  "'
    ],
  ]

  cases.forEach(([template, ctx, result]) => {
    assert.equal(tpl(template, ctx), result)
  })
})

test.run()

