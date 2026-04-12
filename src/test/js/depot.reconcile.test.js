import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, tempy, path} from 'zx-extra'

import {preflight} from '../../main/js/post/depot/reconcile.js'
import {resolvePkgVersion} from '../../main/js/post/depot/steps/analyze.js'
import {formatTag} from '../../main/js/post/depot/generators/tag.js'
import {createFakeRepo, addCommits} from './utils/repo.js'

const test = suite('depot.reconcile')

const makePkgCtx = async ({cwd, tag, version = '1.0.1', name = 'a'}) => {
  const sha = (await $({cwd})`git rev-parse HEAD`).toString().trim()
  const root = (await $({cwd})`git rev-parse --show-toplevel`).toString().trim()

  const pkg = {
    name,
    version,
    tag,
    absPath: cwd,
    releaseType: 'patch',
    manifest: {name, version},
    config: {},
    latest: {tag: {ref: tag, version, name}, meta: null},
  }
  const ctx = {
    git: {sha, root},
    flags: {},
  }
  return {pkg, ctx, sha}
}

test('preflight: tag does not exist on remote — returns ok', async () => {
  const cwd = await createFakeRepo({commits: [
    {msg: 'feat: init', files: [{relpath: 'a.txt', contents: 'a'}]},
  ]})
  await $({cwd})`git push origin master`

  const tag = formatTag({name: 'a', version: '1.0.1'})
  const {pkg, ctx} = await makePkgCtx({cwd, tag, version: '1.0.1'})

  $.memo = new Map()
  const result = await preflight(pkg, ctx)
  assert.is(result, 'ok')
})

test('preflight: tag exists for same commit — returns skip', async () => {
  const cwd = await createFakeRepo({commits: [
    {msg: 'feat: init', files: [{relpath: 'a.txt', contents: 'a'}]},
  ]})
  const sha = (await $({cwd})`git rev-parse HEAD`).toString().trim()
  const tag = formatTag({name: 'a', version: '1.0.1'})

  await $({cwd})`git push origin master`
  await $({cwd})`git tag -m ${tag} ${tag} ${sha}`
  await $({cwd})`git push origin ${tag}`

  const {pkg, ctx} = await makePkgCtx({cwd, tag, version: '1.0.1'})

  $.memo = new Map()
  const result = await preflight(pkg, ctx)
  assert.is(result, 'skip')
})

test('preflight: our commit is older than remote tag — returns skip', async () => {
  const cwd = await createFakeRepo({commits: [
    {msg: 'feat: init', files: [{relpath: 'a.txt', contents: 'a'}]},
  ]})
  const oldSha = (await $({cwd})`git rev-parse HEAD`).toString().trim()

  await addCommits({cwd, commits: [
    {msg: 'fix: update', files: [{relpath: 'b.txt', contents: 'b'}]},
  ]})
  const newSha = (await $({cwd})`git rev-parse HEAD`).toString().trim()

  const tag = formatTag({name: 'a', version: '1.0.1'})
  await $({cwd})`git push origin master`
  await $({cwd})`git tag -m ${tag} ${tag} ${newSha}`
  await $({cwd})`git push origin ${tag}`

  // Pretend we're running from the OLD commit
  const root = (await $({cwd})`git rev-parse --show-toplevel`).toString().trim()
  const pkg = {
    name: 'a', version: '1.0.1', tag,
    absPath: cwd, releaseType: 'patch',
    manifest: {name: 'a', version: '1.0.1'},
    config: {},
    latest: {tag: {ref: tag, version: '1.0.1', name: 'a'}, meta: null},
  }
  const ctx = {git: {sha: oldSha, root}, flags: {}}

  $.memo = new Map()
  const result = await preflight(pkg, ctx)
  assert.is(result, 'skip')
})

test('preflight: our commit is newer than remote tag — re-resolves version', async () => {
  const cwd = await createFakeRepo({commits: [
    {msg: 'feat: init', files: [{relpath: 'a.txt', contents: 'a'}]},
  ]})
  const oldSha = (await $({cwd})`git rev-parse HEAD`).toString().trim()

  const tag = formatTag({name: 'a', version: '1.0.1'})
  await $({cwd})`git push origin master`
  await $({cwd})`git tag -m ${tag} ${tag} ${oldSha}`
  await $({cwd})`git push origin ${tag}`

  // Add newer commit — we run from here
  await addCommits({cwd, commits: [
    {msg: 'fix: newer fix', files: [{relpath: 'c.txt', contents: 'c'}]},
  ]})
  await $({cwd})`git push origin master`

  const {pkg, ctx} = await makePkgCtx({cwd, tag, version: '1.0.1'})

  $.memo = new Map()
  const result = await preflight(pkg, ctx)
  assert.is(result, 'ok')
  // Version should have been re-resolved past 1.0.1
  assert.ok(pkg.version !== '1.0.1', `expected version to change from 1.0.1, got ${pkg.version}`)
  assert.ok(pkg.tag !== tag, `expected tag to change from ${tag}, got ${pkg.tag}`)
})

test('preflight: no tag on package — returns ok immediately', async () => {
  const cwd = await createFakeRepo({commits: [
    {msg: 'feat: init', files: [{relpath: 'a.txt', contents: 'a'}]},
  ]})

  const {pkg, ctx} = await makePkgCtx({cwd, tag: null, version: '1.0.0'})
  pkg.tag = null

  $.memo = new Map()
  const result = await preflight(pkg, ctx)
  assert.is(result, 'ok')
})

test.run()
