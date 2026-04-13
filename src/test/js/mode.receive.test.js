import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within, fs, path, tempy} from 'zx-extra'
import {createMock, defaultResponses, has, makePkg, makeCtx, makeReport} from './utils/mock.js'

const test = suite('modes.receive')

const gitLog = '+++fix: test commit__body__abc1__abc1full'

const preparePkg = async (name, overrides = {}) => {
  const absPath = path.join(tempy.temporaryDirectory(), 'packages', name)
  await fs.ensureDir(absPath)
  const manifestContent = JSON.stringify({name, version: '1.0.1', private: false})
  const manifestAbsPath = path.join(absPath, 'package.json')
  await fs.writeFile(manifestAbsPath, manifestContent)

  const pkg = makePkg({name, ...overrides})
  pkg.manifestAbsPath = manifestAbsPath
  pkg.manifestRaw = manifestContent
  return pkg
}

const prevMap = (...entries) => {
  const m = new Map()
  for (const [k, v] of entries) m.set(k, v)
  return m
}

const baseEnv = () => ({PATH: process.env.PATH, HOME: process.env.HOME, GH_TOKEN: 'ghp_test', NPM_TOKEN: 'npm_test'})
const responses = () => defaultResponses({log: gitLog})

test('writes context with packages that have releases', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()
    const mock = createMock([
      ...responses(),
      ['git ls-remote', ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runReceive} = await import(`../../main/js/post/modes/receive.js?t=${Date.now()}`)

    const flags = {}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd, flags})

    const report = makeReport()
    const ctx = makeCtx({
      cwd,
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
    })

    await runReceive({cwd, env: ctx.env, flags}, ctx)

    const contextFile = path.resolve(cwd, 'zbr-context.json')
    assert.ok(await fs.pathExists(contextFile), 'context file exists')

    const context = await fs.readJson(contextFile)
    assert.is(context.status, 'proceed')
    assert.ok(context.packages.a, 'package a is in context')
  })
})

test('writes skip context when nothing to release', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()
    // Empty git log => no changes => releaseType=null => skipped
    const mock = createMock([
      ...defaultResponses(),
      ['git ls-remote', ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runReceive} = await import(`../../main/js/post/modes/receive.js?t=${Date.now()}`)

    const flags = {}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd, flags})

    const report = makeReport()
    const ctx = makeCtx({
      cwd,
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
    })

    await runReceive({cwd, env: ctx.env, flags}, ctx)

    const contextFile = path.resolve(cwd, 'zbr-context.json')
    const context = await fs.readJson(contextFile)
    assert.is(context.status, 'skip')
    assert.is(context.reason, 'nothing to release')
  })
})

test('dryRun prevents rebuild signal consumption', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()
    const mock = createMock([
      ...responses(),
      ['git ls-remote', ''],
      [/git push origin :refs\/tags/, ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runReceive} = await import(`../../main/js/post/modes/receive.js?t=${Date.now()}`)

    const flags = {dryRun: true}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd, flags})

    const env = {
      ...baseEnv(),
      GITHUB_REF_TYPE: 'tag',
      GITHUB_REF_NAME: 'zbr-rebuild.abc1234',
    }

    const report = makeReport()
    const ctx = makeCtx({
      cwd,
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
      env,
    })

    await runReceive({cwd, env, flags}, ctx)

    const deleteTagCalls = mock.calls.filter(c => c.includes('git push origin :refs/tags'))
    assert.is(deleteTagCalls.length, 0, 'rebuild signal was not consumed')
  })
})

test('rebuild trigger consumed when not dryRun', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()
    const mock = createMock([
      ...responses(),
      ['git ls-remote', ''],
      [/git push origin :refs\/tags/, ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runReceive} = await import(`../../main/js/post/modes/receive.js?t=${Date.now()}`)

    const flags = {}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd, flags})

    const env = {
      ...baseEnv(),
      GITHUB_REF_TYPE: 'tag',
      GITHUB_REF_NAME: 'zbr-rebuild.abc1234',
    }

    const report = makeReport()
    const ctx = makeCtx({
      cwd,
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
      env,
    })

    await runReceive({cwd, env, flags}, ctx)

    const deleteTagCalls = mock.calls.filter(c => c.includes('git push origin :refs/tags'))
    assert.ok(deleteTagCalls.length > 0, 'rebuild signal was consumed')
  })
})

test.run()
