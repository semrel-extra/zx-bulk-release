import {describe, test, expect} from 'vitest'
import npm, {isNpmPublished} from '../../main/js/post/courier/channels/npm.js'

describe('channel.npm', () => {
  test('isNpmPublished returns true for public pkg', () => {
    expect(isNpmPublished({manifest: {private: false}, config: {npmPublish: true}})).toBe(true)
  })

  test('isNpmPublished returns false for private pkg', () => {
    expect(isNpmPublished({manifest: {private: true}, config: {npmPublish: true}})).toBe(false)
  })

  test('isNpmPublished returns false when npmPublish is false', () => {
    expect(isNpmPublished({manifest: {private: false}, config: {npmPublish: false}})).toBe(false)
  })

  test('npm.when filters correctly', () => {
    expect(npm.when({manifest: {private: false}, config: {npmPublish: true}})).toBe(true)
    expect(npm.when({manifest: {private: true}, config: {}})).toBe(false)
    expect(npm.name).toBe('npm')
    expect(npm.snapshot).toBe(true)
  })

  test('run returns duplicate on EPUBLISHCONFLICT', async () => {
    const {api} = await import('../../main/js/post/api/index.js')
    const origNpm = api.npm
    api.npm = {...origNpm, npmPublish: async () => { throw new Error('EPUBLISHCONFLICT') }}

    try {
      const result = await npm.run({
        name: 'pkg', version: '1.0.0',
        registry: 'https://r.com', token: 'tok',
      }, '/tmp')
      expect(result).toBe('duplicate')
    } finally {
      api.npm = origNpm
    }
  })

  test('run returns ok on success', async () => {
    const {api} = await import('../../main/js/post/api/index.js')
    const origNpm = api.npm
    api.npm = {...origNpm, npmPublish: async () => {}}

    try {
      const result = await npm.run({
        name: 'pkg', version: '1.0.0',
        registry: 'https://r.com', token: 'tok',
      }, '/tmp')
      expect(result).toBe('ok')
    } finally {
      api.npm = origNpm
    }
  })

  test('run rethrows non-duplicate errors', async () => {
    const {api} = await import('../../main/js/post/api/index.js')
    const origNpm = api.npm
    api.npm = {...origNpm, npmPublish: async () => { throw new Error('network error') }}

    try {
      await npm.run({name: 'pkg', version: '1.0.0', registry: 'r', token: 'tok'}, '/tmp')
      expect.unreachable('should throw')
    } catch (e) {
      expect(e.message.includes('network error')).toBeTruthy()
    } finally {
      api.npm = origNpm
    }
  })

})
