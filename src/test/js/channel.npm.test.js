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

test.run()
