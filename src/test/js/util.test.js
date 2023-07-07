import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {tpl, get, set, getCommonPath} from '../../main/js/util.js'

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

test('getCommonPath()', () => {
  const cases = [
    [
      'single dir',
      [
        'foo/bar/'
      ],
      'foo/bar/'
    ],
    [
      'single file',
      [
        'baz.json'
      ],
      ''
    ],
    [
      'single file in nested dir',
      [
        'foo/bar/baz.json'
      ],
      'foo/bar/'
    ],
    [
      'pair of files in the same dir',
      [
        'foo/bar.json',
        'foo/baz.json'
      ],
      'foo/'
    ],
    [
      'pair of dirs',
      [
        'foo/bar/qux/',
        'foo/bar/baz/'
      ],
      'foo/bar/'
    ]
  ];

  cases.forEach(([name, input, expected]) => {
    assert.equal(getCommonPath(input), expected, name)
  })
})

test.run()

