import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createMock, defaultResponses, makePkg, makeCtx, has} from './utils/mock.js'

import npm, {isNpmPublished} from '../../main/js/processor/publishers/npm.js'
import ghRelease from '../../main/js/processor/publishers/gh-release.js'
import ghPages from '../../main/js/processor/publishers/gh-pages.js'
import changelog from '../../main/js/processor/publishers/changelog.js'
import cmd from '../../main/js/processor/publishers/cmd.js'
import meta from '../../main/js/processor/publishers/meta.js'

const test = suite('publishers')

const setup = (responses = []) => {
  const mock = createMock([...defaultResponses(), ...responses])
  $.spawn = mock.spawn
  $.quiet = true
  $.verbose = false
  $.memo = new Map()
  $.report = undefined
  return mock
}

// --- npm publisher ---

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

// --- gh-release publisher ---

test('gh-release.when checks ghToken', () => {
  assert.is(ghRelease.when({config: {ghToken: 'tok'}}), true)
  assert.is(ghRelease.when({config: {}}), false)
  assert.is(ghRelease.name, 'gh-release')
})

// --- gh-pages publisher ---

test('gh-pages.when checks ghPages config', () => {
  assert.is(ghPages.when({config: {ghPages: 'gh-pages docs'}}), true)
  assert.is(ghPages.when({config: {}}), false)
  assert.is(ghPages.name, 'gh-pages')
})

// --- changelog publisher ---

test('changelog.when checks changelog config', () => {
  assert.is(changelog.when({config: {changelog: 'changelog'}}), true)
  assert.is(changelog.when({config: {}}), false)
  assert.is(changelog.name, 'changelog')
})

// --- cmd publisher ---

test('cmd.when checks publishCmd', () => {
  const pkg1 = {config: {publishCmd: 'echo pub'}, ctx: {flags: {}}}
  const pkg2 = {config: {}, ctx: {flags: {publishCmd: 'echo pub'}}}
  const pkg3 = {config: {}, ctx: {flags: {}}}

  assert.is(cmd.when(pkg1), true)
  assert.is(cmd.when(pkg2), true)
  assert.is(cmd.when(pkg3), false)
  assert.is(cmd.name, 'cmd')
  assert.is(cmd.snapshot, true)
})

test('cmd.run calls exec with publishCmd', async () => {
  const ran = []
  const exec = async (pkg, name) => ran.push(name)
  const pkg = makePkg()
  await cmd.run(pkg, exec)
  assert.ok(ran.includes('publishCmd'))
})

// --- meta publisher ---

test('meta.when checks meta.type config', () => {
  assert.is(meta.when({config: {meta: {type: 'commit'}}}), true)
  assert.is(meta.when({config: {meta: {type: null}}}), false)
  assert.is(meta.name, 'meta')
})

test.run()
