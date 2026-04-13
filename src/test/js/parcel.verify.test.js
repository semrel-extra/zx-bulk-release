import {describe, test, expect} from 'vitest'
import {verifyParcels} from '../../main/js/post/parcel/index.js'

describe('parcel.verify', () => {
  const makeContext = (sha, packages) => ({
    status: 'proceed',
    sha,
    sha7: sha.slice(0, 7),
    packages,
  })

  const sha = 'abc1234567890abcdef'
  const sha7 = sha.slice(0, 7)

  test('accepts valid parcels matching context', () => {
    const ctx = makeContext(sha, {
      pkg: {version: '1.0.1', channels: ['npm', 'git-tag']},
    })
    const tars = [
      `/dir/parcel.${sha7}.npm.pkg.1.0.1.aaa111.tar`,
      `/dir/parcel.${sha7}.git-tag.pkg.1.0.1.bbb222.tar`,
    ]

    const {verified, errors} = verifyParcels(tars, ctx)
    expect(errors.length).toBe(0)
    expect(verified.length).toBe(2)
  })

  test('rejects parcels with wrong sha', () => {
    const ctx = makeContext(sha, {
      pkg: {version: '1.0.1', channels: ['npm']},
    })
    const tars = [`/dir/parcel.XXXXXXX.npm.pkg.1.0.1.aaa111.tar`]

    const {verified, errors} = verifyParcels(tars, ctx)
    expect(errors.length).toBe(1)
    expect(errors[0].includes('sha mismatch')).toBeTruthy()
    expect(verified.length).toBe(0)
  })

  test('rejects parcels with unexpected channel', () => {
    const ctx = makeContext(sha, {
      pkg: {version: '1.0.1', channels: ['npm']},
    })
    const tars = [`/dir/parcel.${sha7}.gh-release.pkg.1.0.1.aaa111.tar`]

    const {verified, errors} = verifyParcels(tars, ctx)
    expect(errors.length).toBe(1)
    expect(errors[0].includes('unexpected channel')).toBeTruthy()
    expect(verified.length).toBe(0)
  })

  test('rejects parcels with no matching package', () => {
    const ctx = makeContext(sha, {
      pkg: {version: '1.0.1', channels: ['npm']},
    })
    const tars = [`/dir/parcel.${sha7}.npm.other.2.0.0.aaa111.tar`]

    const {verified, errors} = verifyParcels(tars, ctx)
    expect(errors.length).toBe(1)
    expect(errors[0].includes('no matching package')).toBeTruthy()
    expect(verified.length).toBe(0)
  })

  test('passes directives through without package match', () => {
    const ctx = makeContext(sha, {})
    const tars = [`/dir/parcel.${sha7}.directive.1700000000.tar`]

    const {verified, errors} = verifyParcels(tars, ctx)
    expect(errors.length).toBe(0)
    expect(verified.length).toBe(1)
  })

  test('matches scoped package names', () => {
    const ctx = makeContext(sha, {
      '@scope/my-pkg': {version: '1.0.1', channels: ['npm']},
    })
    // @scope/my-pkg → scope-my-pkg
    const tars = [`/dir/parcel.${sha7}.npm.scope-my-pkg.1.0.1.aaa111.tar`]

    const {verified, errors} = verifyParcels(tars, ctx)
    expect(errors.length).toBe(0)
    expect(verified.length).toBe(1)
  })

  test('collects multiple errors', () => {
    const ctx = makeContext(sha, {
      pkg: {version: '1.0.1', channels: ['npm']},
    })
    const tars = [
      `/dir/parcel.XXXXXXX.npm.pkg.1.0.1.aaa.tar`,       // sha mismatch
      `/dir/parcel.${sha7}.gh-release.pkg.1.0.1.bbb.tar`, // unexpected channel
    ]

    const {verified, errors} = verifyParcels(tars, ctx)
    expect(errors.length).toBe(2)
    expect(verified.length).toBe(0)
  })

  test('empty tars yields empty results', () => {
    const ctx = makeContext(sha, {})
    const {verified, errors} = verifyParcels([], ctx)
    expect(errors.length).toBe(0)
    expect(verified.length).toBe(0)
  })

})
