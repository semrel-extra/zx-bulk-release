import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import npm, {isNpmPublished} from '../../main/js/post/courier/channels/npm.js'

const test = suite('channel.npm')

test('isNpmPublished returns true for public pkg', () => {
  assert.is(isNpmPublished({manifest: {private: false}, config: {npmPublish: true}}), true)
})

test('isNpmPublished returns false for private pkg', () => {
  assert.is(isNpmPublished({manifest: {private: true}, config: {npmPublish: true}}), false)
})

test('isNpmPublished returns false when npmPublish is false', () => {
  assert.is(isNpmPublished({manifest: {private: false}, config: {npmPublish: false}}), false)
})

test('npm.when filters correctly', () => {
  assert.is(npm.when({manifest: {private: false}, config: {npmPublish: true}}), true)
  assert.is(npm.when({manifest: {private: true}, config: {}}), false)
  assert.is(npm.name, 'npm')
  assert.is(npm.snapshot, true)
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
    assert.is(result, 'duplicate')
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
    assert.is(result, 'ok')
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
    assert.unreachable('should throw')
  } catch (e) {
    assert.ok(e.message.includes('network error'))
  } finally {
    api.npm = origNpm
  }
})

test.run()
