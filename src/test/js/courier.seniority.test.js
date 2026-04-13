import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createSpawnMock, defaultResponses} from './utils/mock.js'

const test = suite('courier.seniority')

test('hasHigherVersion returns false when no tags exist', async () => {
  await within(async () => {
    const mock = createSpawnMock([
      ...defaultResponses(),
      ['git ls-remote --tags', ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {hasHigherVersion} = await import(`../../main/js/post/courier/seniority.js?t=${Date.now()}`)

    const result = await hasHigherVersion('/tmp/repo', 'test-pkg', '1.0.0')
    assert.is(result, false)
  })
})

test('hasHigherVersion returns true when a higher version tag exists', async () => {
  await within(async () => {
    const tagsOutput = 'abc123\trefs/tags/2026.1.1-test-pkg.2.0.0-f0\n'
    const mock = createSpawnMock([
      ...defaultResponses(),
      ['git ls-remote --tags', tagsOutput],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {hasHigherVersion} = await import(`../../main/js/post/courier/seniority.js?t=${Date.now()}`)

    const result = await hasHigherVersion('/tmp/repo', 'test-pkg', '1.0.0')
    assert.is(result, true)
  })
})

test('hasHigherVersion returns false when only lower version tags exist', async () => {
  await within(async () => {
    const tagsOutput = 'abc123\trefs/tags/2026.1.1-test-pkg.0.9.0-f0\n'
    const mock = createSpawnMock([
      ...defaultResponses(),
      ['git ls-remote --tags', tagsOutput],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {hasHigherVersion} = await import(`../../main/js/post/courier/seniority.js?t=${Date.now()}`)

    const result = await hasHigherVersion('/tmp/repo', 'test-pkg', '1.0.0')
    assert.is(result, false)
  })
})

test('hasHigherVersion ignores tags for other packages', async () => {
  await within(async () => {
    const tagsOutput = 'abc123\trefs/tags/2026.1.1-other-pkg.9.0.0-f0\n'
    const mock = createSpawnMock([
      ...defaultResponses(),
      ['git ls-remote --tags', tagsOutput],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {hasHigherVersion} = await import(`../../main/js/post/courier/seniority.js?t=${Date.now()}`)

    const result = await hasHigherVersion('/tmp/repo', 'test-pkg', '1.0.0')
    assert.is(result, false)
  })
})

test('hasHigherVersion handles unparseable tags gracefully', async () => {
  await within(async () => {
    const tagsOutput = 'abc123\trefs/tags/not-a-valid-tag\nabc456\trefs/tags/2026.1.1-test-pkg.0.5.0-f0\n'
    const mock = createSpawnMock([
      ...defaultResponses(),
      ['git ls-remote --tags', tagsOutput],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {hasHigherVersion} = await import(`../../main/js/post/courier/seniority.js?t=${Date.now()}`)

    const result = await hasHigherVersion('/tmp/repo', 'test-pkg', '1.0.0')
    assert.is(result, false)
  })
})

test.run()
