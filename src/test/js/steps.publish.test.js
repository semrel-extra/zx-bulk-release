import {describe, test, expect} from 'vitest'
import {$, within, fs, tempy} from 'zx-extra'
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

  test('publish throws when a parcel breaks its populate rules', async () => {
    await within(async () => {
      await setup()
      const {publish} = await import(/* @vite-ignore */ `../../main/js/post/depot/steps/publish.js?t=${Date.now()}`)
      const {packTar} = await import('../../main/js/post/tar.js')
      const {mergePopulate} = await import('../../main/js/post/parcel/populate.js')

      const tarPath = `${tempy.temporaryDirectory()}/parcel.abc1234.npm.test-pkg.1.0.1.aaa111.tar`
      await packTar(tarPath, {channel: 'npm', name: 'test-pkg', version: '1.0.1', token: '${{NPM_TOKEN}}', registry: '${{NPM_REGISTRY}}', populate: mergePopulate({
        schemas:  {npmjs: {type: 'url', protocol: 'https:', hostname: 'registry.npmjs.org'}},
        channels: {npm: {registry: {schema: 'npmjs'}}},
      })})

      const pkg = makePkg()
      const ctx = makeCtx({env: {NPM_REGISTRY: 'https://evil.example/'}})
      pkg.ctx = ctx
      pkg.tars = [tarPath]

      await expect(publish(pkg, ctx)).rejects.toThrow('populate rules: 1 parcel(s) of test-pkg not delivered')
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
