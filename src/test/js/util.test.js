import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {tpl, get, set} from '../../main/js/util.js'

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

test('set/get()', () => {
  const obj = {arr: [{}]}

  set(obj, 'foo.bar', 'baz')
  set(obj, 'arr.0.name', 'name')
  assert.equal(get(obj, 'foo.bar'), 'baz')
  assert.equal(get(obj, 'arr.0.name'), 'name')
  assert.equal(get(obj, '.'), obj)
  assert.equal(get(obj), obj)
})

test.run()

