import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within, fs} from 'zx-extra'
import {createMock, defaultResponses, makePkg, makeCtx, has, tmpDir} from './utils/mock.js'
import {channels} from '../../main/js/post/courier/index.js'

const test = suite('steps.publish')

const setup = async (responses = []) => {
  await fs.ensureDir(tmpDir)
  await fs.writeJson(`${tmpDir}/package.json`, {name: 'test-pkg', version: '1.0.1'}, {spaces: 2})
  const mock = createMock([...responses, ...defaultResponses()])
  $.spawn = mock.spawn
  $.quiet = true
  $.verbose = false
  $.memo = new Map()
  $.report = undefined
  return mock
}

const registerTestChannel = (name, impl) => {
  channels[name] = {name, ...impl}
  return () => { delete channels[name] }
}

test('publish throws when version not synced', async () => {
  await within(async () => {
    await setup()
    const {publish} = await import(`../../main/js/post/depot/steps/publish.js?t=${Date.now()}`)

    const pkg = makePkg({version: '2.0.0', extra: {manifest: {name: 'test-pkg', version: '1.0.0'}}})
    const ctx = makeCtx()
    pkg.ctx = ctx

    try {
      await publish(pkg, ctx)
      assert.unreachable('should have thrown')
    } catch (e) {
      assert.ok(e.message.includes('version not synced'))
    }
  })
})

test('publish pushes tag and runs channels', async () => {
  await within(async () => {
    const mock = await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)
    const {publish} = await import(`../../main/js/post/depot/steps/publish.js?t=${Date.now()}`)

    const ran = []
    const cleanup = registerTestChannel('test-pub', {
      when: () => true,
      run: async () => ran.push('test-pub'),
      snapshot: false,
    })

    const pkg = makePkg({
      version: '1.0.1',
      extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}',
        manifestAbsPath: `${tmpDir}/package.json`,
      },
    })
    const ctx = makeCtx({channels: ['git-tag', 'test-pub'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)
    await publish(pkg, ctx)

    assert.ok(pkg.published)
    assert.ok(ran.includes('test-pub'))
    assert.ok(has(mock.calls, 'git tag -m'))
    assert.ok(has(mock.calls, 'git push'))

    cleanup()
  })
})

test('publish in snapshot mode skips tag push', async () => {
  await within(async () => {
    const mock = await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)
    const {publish} = await import(`../../main/js/post/depot/steps/publish.js?t=${Date.now()}`)

    const ran = []
    const cleanup = registerTestChannel('snap-pub', {
      when: () => true,
      run: async () => ran.push('snap-pub'),
      snapshot: true,
    })

    const pkg = makePkg({
      version: '1.0.1',
      extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}',
        manifestAbsPath: `${tmpDir}/package.json`,
      },
    })
    const ctx = makeCtx({channels: ['snap-pub'], flags: {snapshot: true}})
    pkg.ctx = ctx

    await pack(pkg, ctx)
    await publish(pkg, ctx)

    assert.ok(pkg.published)
    assert.ok(ran.includes('snap-pub'))
    // snapshot mode should NOT push a release tag
    assert.ok(!has(mock.calls, 'git tag -m'))

    cleanup()
  })
})

test('pack calls prepare on channels', async () => {
  await within(async () => {
    await setup()
    const {pack} = await import(`../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)

    const prepared = []
    const cleanup = registerTestChannel('prep-pub', {
      when: () => true,
      prepare: async () => prepared.push('done'),
      run: async () => {},
      snapshot: false,
    })

    const pkg = makePkg({
      version: '1.0.1',
      extra: {
        manifest: {name: 'test-pkg', version: '1.0.1', private: false},
        manifestRaw: '{}',
        manifestAbsPath: `${tmpDir}/package.json`,
      },
    })
    const ctx = makeCtx({channels: ['prep-pub'], flags: {}})
    pkg.ctx = ctx

    await pack(pkg, ctx)

    assert.equal(prepared, ['done'])

    cleanup()
  })
})

test.run()
