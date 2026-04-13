import {describe, test, expect} from 'vitest'
import {$, within, fs} from 'zx-extra'
import {createSpawnMock, defaultResponses, makePkg, makeCtx, has, tmpDir} from './utils/mock.js'
import {channels} from '../../main/js/post/courier/index.js'

describe('steps.publish', () => {
  const setup = async (responses = []) => {
    await fs.ensureDir(tmpDir)
    await fs.writeJson(`${tmpDir}/package.json`, {name: 'test-pkg', version: '1.0.1'}, {spaces: 2})
    const mock = createSpawnMock([...responses, ...defaultResponses()])
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
      const {publish} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/publish.js?t=${Date.now()}`)

      const pkg = makePkg({version: '2.0.0', extra: {manifest: {name: 'test-pkg', version: '1.0.0'}}})
      const ctx = makeCtx()
      pkg.ctx = ctx

      try {
        await publish(pkg, ctx)
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e.message.includes('version not synced')).toBeTruthy()
      }
    })
  })

  test('publish delivers parcels and pushes tag via git-tag channel', async () => {
    await within(async () => {
      const mock = await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)
      const {publish} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/publish.js?t=${Date.now()}`)

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

      expect(pkg.published).toBeTruthy()
      expect(ran.includes('test-pub')).toBeTruthy()
      // git-tag channel pushes the tag via deliver
      expect(has(mock.calls, 'git tag -m')).toBeTruthy()
      expect(has(mock.calls, 'git push')).toBeTruthy()

      cleanup()
    })
  })

  test('publish in snapshot mode skips tag push', async () => {
    await within(async () => {
      const mock = await setup()
      const {pack} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/pack.js?t=${Date.now()}`)
      const {publish} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/publish.js?t=${Date.now()}`)

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
      const ctx = makeCtx({channels: ['git-tag', 'snap-pub'], flags: {snapshot: true}})
      pkg.ctx = ctx

      await pack(pkg, ctx)
      await publish(pkg, ctx)

      expect(pkg.published).toBeTruthy()
      expect(ran.includes('snap-pub')).toBeTruthy()
      // snapshot mode: git-tag channel's when() returns false, no tag push
      expect(has(mock.calls, 'git tag -m')).toBeFalsy()

      cleanup()
    })
  })

})
