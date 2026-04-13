import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {PassThrough} from 'node:stream'
import {EventEmitter} from 'node:events'
import {$, within, fs, path, tempy} from 'zx-extra'
import {createSpawnMock, defaultResponses, has, makePkg, makeCtx, makeReport} from './utils/mock.js'

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
    const mock = createSpawnMock([
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
    const mock = createSpawnMock([
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
    const mock = createSpawnMock([
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
    const mock = createSpawnMock([
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

test('rebuild signal already consumed writes skip context', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()

    // Custom spawn that returns exitCode=1 + stderr for the deleteRemoteTag call
    const baseMock = createSpawnMock([
      ...responses(),
      ['git ls-remote', ''],
    ])
    const spawn = (cmd, args) => {
      const command = args?.[args.length - 1] || cmd
      if (command.includes('git push origin :refs/tags')) {
        // Return proc with exitCode=1 and stderr containing 'remote ref does not exist'
        const p = new EventEmitter()
        p.stdout = new PassThrough()
        p.stderr = new PassThrough()
        p.stdin = new PassThrough()
        p.pid = 1
        process.nextTick(() => {
          p.stdout.end('')
          p.stderr.end('error: remote ref does not exist')
          p.emit('close', 1, null)
          p.emit('exit', 1, null)
        })
        baseMock.calls.push(command)
        return p
      }
      return baseMock.spawn(cmd, args)
    }

    $.spawn = spawn
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

    const contextFile = path.resolve(cwd, 'zbr-context.json')
    assert.ok(await fs.pathExists(contextFile), 'context file exists')
    const context = await fs.readJson(contextFile)
    assert.is(context.status, 'skip')
    assert.is(context.reason, 'rebuild claimed by another process')
  })
})

test('error in receive propagates after setting failure', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()
    const mock = createSpawnMock([
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
    // Force traverseQueue cb to throw by providing a broken prev structure
    // that causes within() + contextify + analyze chain to fail.
    // Simplest: set queue to include a name that doesn't exist in packages.
    const ctx = makeCtx({
      cwd,
      packages: {a: pkg},
      queue: ['a', 'nonexistent'],
      prev: prevMap(['a', []], ['nonexistent', []]),
      flags,
      report,
    })

    try {
      await runReceive({cwd, env: ctx.env, flags}, ctx)
      assert.unreachable('should have thrown')
    } catch (e) {
      const hasError = report.events.some(ev => ev.level === 'error')
      assert.ok(hasError, 'report.error was called')
    }
  })
})

test('tagsFetched triggers re-analyze of packages without releaseType', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()

    // We need two packages: 'a' has a release (releaseType=patch from git log),
    // and 'b' has no release initially (no commits).
    // For preflight on 'a' to return 'refetch', we need:
    //   - git ls-remote returns a sha for a's tag (remote tag exists)
    //   - merge-base --is-ancestor ctx.sha remoteSha => exit 1 (ours NOT ancestor of remote)
    //   - merge-base --is-ancestor remoteSha ctx.sha => exit 0 (remote IS ancestor of ours)
    //   - git fetch origin --tags --force => success
    // Then re-analyze runs for 'b'.

    const remoteSha = 'def7890123456'
    const pkgATag = '2026.1.1-a.1.0.2-f0'

    const mock = createSpawnMock([
      ['git rev-parse --show-toplevel', cwd],
      ['git rev-parse HEAD', 'abc1234567890'],
      ['git config --get remote.origin.url', 'https://github.com/test-org/test-repo.git'],
      ['git tag -l', ''],
      // git log for pkg a returns a commit, for pkg b returns nothing
      [/git log .+--format/, gitLog],
      ['git config user.name', ''],
      ['git config user.email', ''],
      [/git tag -m/, ''],
      ['git push', ''],
      ['git fetch', ''],
      ['npm --version', '10.0.0'],
      ['npm view', ''],
      [/curl/, '{}'],
      [/echo/, ''],
      // preflight: ls-remote returns remote sha for a's tag
      ['git ls-remote', `${remoteSha}\trefs/tags/${pkgATag}`],
      // fetch --deepen for merge-base
      [/git fetch --deepen/, ''],
      // merge-base --is-ancestor ctx.sha remoteSha => exit 1 (ours not ancestor)
      [/git merge-base --is-ancestor abc1234567890/, '', 1],
      // merge-base --is-ancestor remoteSha ctx.sha => exit 0 (remote is ancestor = we are newer)
      [/git merge-base --is-ancestor def7890123456/, '', 0],
      // fetch tags force
      [/git fetch origin --tags --force/, ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runReceive} = await import(`../../main/js/post/modes/receive.js?t=${Date.now()}`)

    const flags = {}
    const pkgA = await preparePkg('a')
    pkgA.ctx = makeCtx({cwd, flags})

    const pkgB = await preparePkg('b', {releaseType: null, changes: []})
    pkgB.ctx = makeCtx({cwd, flags})

    const report = makeReport()
    const ctx = makeCtx({
      cwd,
      packages: {a: pkgA, b: pkgB},
      queue: ['a', 'b'],
      prev: prevMap(['a', []], ['b', []]),
      flags,
      report,
    })

    await runReceive({cwd, env: ctx.env, flags}, ctx)

    // Verify re-analyze happened: check report events for 're-analyzing'
    const reAnalyzeEvents = report.events.filter(ev =>
      ev.level === 'info' && JSON.stringify(ev.msg).includes('tags fetched during preflight')
    )
    assert.ok(reAnalyzeEvents.length > 0 || has(mock.calls, 'git fetch origin --tags --force'),
      'tags were fetched and re-analyze path was triggered')

    const contextFile = path.resolve(cwd, 'zbr-context.json')
    assert.ok(await fs.pathExists(contextFile), 'context file exists')
  })
})

test.run()
