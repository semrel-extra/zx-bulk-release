import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {verifyParcels} from '../../main/js/post/parcel/index.js'

const test = suite('parcel.verify')

const makeContext = (sha, packages) => ({
  status: 'proceed',
  sha,
  sha7: sha.slice(0, 7),
  packages,
})

const sha = 'abc1234567890abcdef'
const sha7 = sha.slice(0, 7)
const tag = '2026.4.12-pkg.1.0.1-f0'

test('accepts valid parcels matching context', () => {
  const ctx = makeContext(sha, {
    pkg: {version: '1.0.1', tag, channels: ['npm', 'git-tag']},
  })
  const tars = [
    `/dir/parcel.${sha7}.npm.${tag}.aaa111.tar`,
    `/dir/parcel.${sha7}.git-tag.${tag}.bbb222.tar`,
  ]

  const {verified, errors} = verifyParcels(tars, ctx)
  assert.is(errors.length, 0)
  assert.is(verified.length, 2)
})

test('rejects parcels with wrong sha', () => {
  const ctx = makeContext(sha, {
    pkg: {version: '1.0.1', tag, channels: ['npm']},
  })
  const tars = [`/dir/parcel.XXXXXXX.npm.${tag}.aaa111.tar`]

  const {verified, errors} = verifyParcels(tars, ctx)
  assert.is(errors.length, 1)
  assert.ok(errors[0].includes('sha mismatch'))
  assert.is(verified.length, 0)
})

test('rejects parcels with unexpected channel', () => {
  const ctx = makeContext(sha, {
    pkg: {version: '1.0.1', tag, channels: ['npm']},
  })
  const tars = [`/dir/parcel.${sha7}.gh-release.${tag}.aaa111.tar`]

  const {verified, errors} = verifyParcels(tars, ctx)
  assert.is(errors.length, 1)
  assert.ok(errors[0].includes('unexpected channel'))
  assert.is(verified.length, 0)
})

test('rejects parcels with no matching package', () => {
  const ctx = makeContext(sha, {
    pkg: {version: '1.0.1', tag, channels: ['npm']},
  })
  const otherTag = '2026.4.12-other.2.0.0-f0'
  const tars = [`/dir/parcel.${sha7}.npm.${otherTag}.aaa111.tar`]

  const {verified, errors} = verifyParcels(tars, ctx)
  assert.is(errors.length, 1)
  assert.ok(errors[0].includes('no matching package'))
  assert.is(verified.length, 0)
})

test('passes directives through without package match', () => {
  const ctx = makeContext(sha, {})
  const tars = [`/dir/parcel.${sha7}.directive.1700000000.tar`]

  const {verified, errors} = verifyParcels(tars, ctx)
  assert.is(errors.length, 0)
  assert.is(verified.length, 1)
})

test('does not confuse tag containing "directive" with actual directive', () => {
  const directiveTag = '2026.4.12-my.directive.pkg.1.0.1-f0'
  const ctx = makeContext(sha, {
    'my-directive-pkg': {version: '1.0.1', tag: directiveTag, channels: ['npm']},
  })
  // channel (3rd dot-segment) is "npm", not "directive"
  const tars = [`/dir/parcel.${sha7}.npm.${directiveTag}.aaa111.tar`]

  const {verified, errors} = verifyParcels(tars, ctx)
  assert.is(errors.length, 0)
  assert.is(verified.length, 1)
})

test('collects multiple errors', () => {
  const ctx = makeContext(sha, {
    pkg: {version: '1.0.1', tag, channels: ['npm']},
  })
  const tars = [
    `/dir/parcel.XXXXXXX.npm.${tag}.aaa.tar`,      // sha mismatch
    `/dir/parcel.${sha7}.gh-release.${tag}.bbb.tar`, // unexpected channel
  ]

  const {verified, errors} = verifyParcels(tars, ctx)
  assert.is(errors.length, 2)
  assert.is(verified.length, 0)
})

test('empty tars yields empty results', () => {
  const ctx = makeContext(sha, {})
  const {verified, errors} = verifyParcels([], ctx)
  assert.is(errors.length, 0)
  assert.is(verified.length, 0)
})

test.run()
