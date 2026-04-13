import {describe, test, expect} from 'vitest'
import {tpl, get, set} from '../../main/js/util.js'

describe('util', () => {
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
      expect(tpl(template, ctx)).toEqual(result)
    })
  })

  test('set/get()', () => {
    const obj = {arr: [{}]}

    set(obj, 'foo.bar', 'baz')
    set(obj, 'arr.0.name', 'name')
    expect(get(obj, 'foo.bar')).toEqual('baz')
    expect(get(obj, 'arr.0.name')).toEqual('name')
    expect(get(obj, '.')).toEqual(obj)
    expect(get(obj)).toEqual(obj)
  })

})
