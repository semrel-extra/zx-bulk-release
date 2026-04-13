import {describe, test, expect} from 'vitest'
import meta from '../../main/js/post/courier/channels/meta.js'

describe('channel.meta', () => {
  test('when checks meta.type config', () => {
    expect(meta.when({config: {meta: {type: 'commit'}}})).toBe(true)
    expect(meta.when({config: {meta: {type: null}}})).toBe(false)
    expect(meta.name).toBe('meta')
  })

})
