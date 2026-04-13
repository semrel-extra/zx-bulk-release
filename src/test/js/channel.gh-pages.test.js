import {describe, test, expect} from 'vitest'
import ghPages from '../../main/js/post/courier/channels/gh-pages.js'

describe('channel.gh-pages', () => {
  test('when checks ghPages config', () => {
    expect(ghPages.when({config: {ghPages: 'gh-pages docs'}})).toBe(true)
    expect(ghPages.when({config: {}})).toBe(false)
    expect(ghPages.name).toBe('gh-pages')
  })

})
