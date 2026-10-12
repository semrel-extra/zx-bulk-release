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

  const withNpm = async (stub, fn) => {
    const {api} = await import('../../main/js/post/api/index.js')
    const origNpm = api.npm
    api.npm = {...origNpm, ...stub}
    try { return await fn() } finally { api.npm = origNpm }
  }
  const manifest = {name: 'pkg', version: '1.0.0', registry: 'https://r.com', token: 'tok'}

  test('run takes the registry\'s word for a republish without a call', () => withNpm({
    npmPublish: async () => { throw new Error('E403 403 Forbidden - You cannot publish over the previously published versions') },
    npmPublished: async () => { throw new Error('the registry must not be asked') },
  }, async () => {
    expect(await npm.run(manifest, '/tmp')).toBe('duplicate')
  }))

  test('run asks the registry when the error is not a known republish', () => withNpm({
    npmPublish: async () => { throw new Error('E400 Bad Request - Repository does not allow updating assets') },
    npmPublished: async ({name, version}) => name === 'pkg' && version === '1.0.0',
  }, async () => {
    expect(await npm.run(manifest, '/tmp')).toBe('duplicate')
  }))

  test('run rethrows a failed publish when the registry lacks the version: a 403 is not a duplicate', () => withNpm({
    npmPublish: async () => { throw new Error('E403 403 Forbidden - two-factor authentication required') },
    npmPublished: async () => false,
  }, async () => {
    await expect(npm.run(manifest, '/tmp')).rejects.toThrow(/two-factor/)
  }))

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
    api.npm = {...origNpm, npmPublish: async () => { throw new Error('network error') }, npmPublished: async () => false}

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
