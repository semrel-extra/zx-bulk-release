import {describe, test, expect} from 'vitest'
import {run} from '../../main/js/index.js'

describe('index', () => {
  test('index has proper exports', () => {
    expect(run).toBeInstanceOf(Function)
  })

})
