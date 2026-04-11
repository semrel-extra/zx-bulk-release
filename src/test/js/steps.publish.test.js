import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within, fs} from 'zx-extra'
import {createMock, defaultResponses, makePkg, makeCtx, has, tmpDir} from './utils/mock.js'
import {publishers} from '../../main/js/courier/index.js'

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

const registerTestPublisher = (name, impl) => {
  publishers[name] = {name, ...impl}
  return () => { delete publishers[name] }
}

test('publish throws when version not synced', async () => {
  await within(async () => {
    await setup()
    const {publish} = await import(`../../main/js/processor/steps/publish.js?t=${Date.now()}`)

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

test('publish pushes tag and runs publishers', async () => {
  await within(async () => {
    const mock = await setup()
    const {publish} = await import(`../../main/js/processor/steps/publish.js?t=${Date.now()}`)

    const ran = []
    const cleanup = registerTestPublisher('test-pub', {
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
    const ctx = makeCtx({publishers: ['git-tag', 'test-pub'], flags: {}})
    pkg.ctx = ctx

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
    const {publish} = await import(`../../main/js/processor/steps/publish.js?t=${Date.now()}`)

    const ran = []
    const cleanup = registerTestPublisher('snap-pub', {
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
    const ctx = makeCtx({publishers: ['snap-pub'], flags: {snapshot: true}})
    pkg.ctx = ctx

    await publish(pkg, ctx)

    assert.ok(pkg.published)
    assert.ok(ran.includes('snap-pub'))
    // snapshot mode should NOT push a release tag
    assert.ok(!has(mock.calls, 'git tag -m'))

    cleanup()
  })
})

test('publish calls prepare on publishers', async () => {
  await within(async () => {
    await setup()
    const {publish} = await import(`../../main/js/processor/steps/publish.js?t=${Date.now()}`)

    const prepared = []
    const cleanup = registerTestPublisher('prep-pub', {
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
    const ctx = makeCtx({publishers: ['prep-pub'], flags: {}})
    pkg.ctx = ctx

    await publish(pkg, ctx)

    assert.equal(prepared, ['done'])

    cleanup()
  })
})

test.run()
