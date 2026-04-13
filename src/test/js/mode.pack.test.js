import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within, fs, path, tempy} from 'zx-extra'
import {createSpawnMock, defaultResponses, has, makePkg, makeCtx, makeReport, tmpDir} from './utils/mock.js'

const test = suite('modes.pack')

const gitLog = '+++fix: test commit__body__abc1__abc1full'

const preparePkg = async (name, overrides = {}) => {
  const absPath = path.join(tempy.temporaryDirectory(), 'packages', name)
  await fs.ensureDir(absPath)
  const manifestContent = JSON.stringify({name, version: '1.0.1', private: false})
  const manifestAbsPath = path.join(absPath, 'package.json')
  await fs.writeFile(manifestAbsPath, manifestContent)

  const pkg = makePkg({name, absPath, ...overrides})
  pkg.manifestAbsPath = manifestAbsPath
  pkg.manifestRaw = manifestContent
  return pkg
}

const prevMap = (...entries) => {
  const m = new Map()
  for (const [k, v] of entries) m.set(k, v)
  return m
}

const responses = () => defaultResponses({log: gitLog})

const getExec = async () => {
  const {exec} = await import(`../../main/js/post/depot/exec.js?t=${Date.now()}`)
  return exec
}

test('dryRun skips pack and publish', async () => {
  await within(async () => {
    const mock = createSpawnMock([
      ...responses(),
      ['git ls-remote', ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runPack} = await import(`../../main/js/post/modes/pack.js?t=${Date.now()}`)
    const exec = await getExec()
    const flags = {dryRun: true, build: true, test: true}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd: tmpDir, flags, run: exec})
    const report = makeReport()
    const ctx = makeCtx({
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
      run: exec,
    })

    await runPack({cwd: tmpDir, env: ctx.env, flags: ctx.flags}, ctx)

    assert.ok(has(mock.calls, 'echo build'), 'build was called')
    assert.ok(has(mock.calls, 'echo test'), 'test was called')
    assert.not.ok(has(mock.calls, 'npm publish'), 'publish was not called')
  })
})

test('skips packages with no releaseType after analyze', async () => {
  await within(async () => {
    // Use empty git log so analyze finds no changes => releaseType=null => skipped
    const mock = createSpawnMock([
      ...defaultResponses(),
      ['git ls-remote', ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runPack} = await import(`../../main/js/post/modes/pack.js?t=${Date.now()}`)
    const flags = {}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd: tmpDir, flags})
    const report = makeReport()
    const ctx = makeCtx({
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
    })

    await runPack({cwd: tmpDir, env: ctx.env, flags: ctx.flags}, ctx)

    // analyze sets releaseType=null because no commits, so pkg should be skipped
    assert.not.ok(has(mock.calls, 'echo build'), 'build was not called')
  })
})

test('publish=false skips publish but runs build and test', async () => {
  await within(async () => {
    const mock = createSpawnMock([
      ...responses(),
      ['git ls-remote', ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runPack} = await import(`../../main/js/post/modes/pack.js?t=${Date.now()}`)
    const exec = await getExec()
    const flags = {build: true, test: true, publish: false}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd: tmpDir, flags, run: exec})
    const report = makeReport()
    const ctx = makeCtx({
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
      run: exec,
    })

    await runPack({cwd: tmpDir, env: ctx.env, flags: ctx.flags}, ctx)

    assert.ok(has(mock.calls, 'echo build'), 'build was called')
    assert.ok(has(mock.calls, 'echo test'), 'test was called')
    // publish=false means we don't get to pack/publish steps
    assert.not.ok(has(mock.calls, 'npm pack'), 'npm pack was not called')
  })
})

test('error sets failure status and rethrows', async () => {
  await within(async () => {
    const mock = createSpawnMock([
      ...responses(),
      ['git ls-remote', ''],
      ['exit 1', '', 1],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runPack} = await import(`../../main/js/post/modes/pack.js?t=${Date.now()}`)
    const exec = await getExec()
    const report = makeReport()
    const flags = {}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd: tmpDir, flags, run: exec})
    pkg.config.buildCmd = 'exit 1'
    const ctx = makeCtx({
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
      run: exec,
    })

    try {
      await runPack({cwd: tmpDir, env: ctx.env, flags: ctx.flags}, ctx)
      assert.unreachable('should have thrown')
    } catch (e) {
      const hasError = report.events.some(ev => ev.level === 'error')
      assert.ok(hasError, 'report.error was called')
    }
  })
})

test('pack with context filter applies version/tag/channels from context', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()
    const contextData = {
      status: 'proceed',
      sha: 'abc1234567890',
      sha7: 'abc1234',
      packages: {
        a: {version: '2.0.0', tag: 'v2.0.0', channels: ['npm']},
      },
    }
    await fs.writeJson(path.resolve(cwd, 'zbr-context.json'), contextData)

    const mock = createSpawnMock([
      ...responses(),
      ['git ls-remote', ''],
      ['npm pack', 'a-2.0.0.tgz'],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runPack} = await import(`../../main/js/post/modes/pack.js?t=${Date.now()}`)
    const exec = await getExec()
    const flags = {pack: true, dryRun: true, build: true, test: true}
    const pkg = await preparePkg('a', {releaseType: null, changes: []})
    pkg.ctx = makeCtx({cwd, flags, run: exec})

    const report = makeReport()
    const ctx = makeCtx({
      cwd,
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
      run: exec,
    })

    await runPack({cwd, env: ctx.env, flags: ctx.flags}, ctx)

    assert.is(pkg.version, '2.0.0', 'version set from context')
    assert.is(pkg.tag, 'v2.0.0', 'tag set from context')
    assert.equal(pkg.contextChannels, ['npm'], 'channels set from context')
    assert.is(pkg.releaseType, 'patch', 'releaseType defaulted to patch')
  })
})

test('pack with context filter skips unknown packages', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()
    const contextData = {
      status: 'proceed',
      sha: 'abc1234567890',
      sha7: 'abc1234',
      packages: {
        b: {version: '3.0.0', tag: 'v3.0.0', channels: ['npm']},
      },
    }
    await fs.writeJson(path.resolve(cwd, 'zbr-context.json'), contextData)

    const mock = createSpawnMock([
      ...responses(),
      ['git ls-remote', ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runPack} = await import(`../../main/js/post/modes/pack.js?t=${Date.now()}`)
    const exec = await getExec()
    const flags = {pack: true, dryRun: true, build: true, test: true}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd, flags, run: exec})

    const report = makeReport()
    const ctx = makeCtx({
      cwd,
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
      run: exec,
    })

    await runPack({cwd, env: ctx.env, flags: ctx.flags}, ctx)

    assert.ok(pkg.skipped, 'pkg a was skipped because not in context')
    assert.not.ok(has(mock.calls, 'echo build'), 'build was not called for skipped pkg')
  })
})

test('pack generates directive when flags.pack is set', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()
    const outputDir = path.resolve(cwd, 'parcels')

    // Write context so context filter is used, with channels that don't need npm
    const contextData = {
      status: 'proceed',
      sha: 'abc1234567890',
      sha7: 'abc1234',
      packages: {
        a: {version: '2.0.0', tag: 'v2.0.0', channels: ['git-tag']},
      },
    }
    await fs.writeJson(path.resolve(cwd, 'zbr-context.json'), contextData)

    const mock = createSpawnMock([
      ...responses(),
      ['git ls-remote', ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runPack} = await import(`../../main/js/post/modes/pack.js?t=${Date.now()}`)
    const exec = await getExec()
    const flags = {pack: true, build: true, test: true}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd, flags, run: exec})

    const report = makeReport()
    const ctx = makeCtx({
      cwd,
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
      run: exec,
    })

    await runPack({cwd, env: ctx.env, flags: ctx.flags}, ctx)

    const files = await fs.readdir(outputDir)
    const directive = files.find(f => f.includes('directive'))
    assert.ok(directive, 'directive tar was created')
  })
})

test('loadContextFilter returns null when no context file', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()
    // No zbr-context.json written — loadContextFilter should return null (standalone mode)

    const mock = createSpawnMock([
      ...responses(),
      ['git ls-remote', ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runPack} = await import(`../../main/js/post/modes/pack.js?t=${Date.now()}`)
    const exec = await getExec()
    const flags = {pack: true, build: true, test: true}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd, flags, run: exec})

    const report = makeReport()
    const ctx = makeCtx({
      cwd,
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
      run: exec,
    })

    await runPack({cwd, env: ctx.env, flags: ctx.flags}, ctx)

    // In standalone mode (no context file), pkg is NOT skipped — it uses own analysis.
    // With gitLog having a fix commit, analyze sets releaseType='patch', so build should run.
    assert.ok(has(mock.calls, 'echo build'), 'build was called in standalone mode')
  })
})

test('loadContextFilter returns null when context status is not proceed', async () => {
  await within(async () => {
    const cwd = tempy.temporaryDirectory()
    await fs.writeJson(path.resolve(cwd, 'zbr-context.json'), {
      status: 'skip',
      reason: 'nothing to release',
    })

    const mock = createSpawnMock([
      ...responses(),
      ['git ls-remote', ''],
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false
    $.memo = new Map()

    const {runPack} = await import(`../../main/js/post/modes/pack.js?t=${Date.now()}`)
    const exec = await getExec()
    const flags = {pack: true, build: true, test: true}
    const pkg = await preparePkg('a')
    pkg.ctx = makeCtx({cwd, flags, run: exec})

    const report = makeReport()
    const ctx = makeCtx({
      cwd,
      packages: {a: pkg},
      queue: ['a'],
      prev: prevMap(['a', []]),
      flags,
      report,
      run: exec,
    })

    await runPack({cwd, env: ctx.env, flags: ctx.flags}, ctx)

    // status !== 'proceed' means loadContextFilter returns null → standalone mode
    assert.ok(has(mock.calls, 'echo build'), 'build was called in standalone mode')
  })
})

test.run()
