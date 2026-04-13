import {describe, test, expect} from 'vitest'
import changelog from '../../main/js/post/courier/channels/changelog.js'

describe('channel.changelog', () => {
  test('when checks changelog config', () => {
    expect(changelog.when({config: {changelog: 'changelog'}})).toBe(true)
    expect(changelog.when({config: {}})).toBe(false)
    expect(changelog.name).toBe('changelog')
  })
})
