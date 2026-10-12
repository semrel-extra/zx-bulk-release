import {describe, test, expect} from 'vitest'
import {fetchManifest, fetchPkg, getNpmrc, npmPublished} from '../../main/js/post/api/npm.js'
import {$, within, tempy, fs} from 'zx-extra'
import {createSpawnMock} from './utils/mock.js'
import {parseEnv} from '../../main/js/config.js'

describe('api.npm', () => {
  test('fetchManifest()', async () => {
    const env = {NPM_REGISTRY: 'https://registry.npmjs.org'}
    const config = parseEnv(env)
    const manifest = await fetchManifest({
      name: 'ggcp',
      version: '1.5.0',
      config
    })
    expect(manifest.name === 'ggcp').toBeTruthy()

    const notfound = await fetchManifest({
      name: '@qiwi/sf2332f-32ds2213-dfs23',
      version: '999.15.0',
      config
    }, {nothrow: true})
    expect(notfound).toBe(null)
  })

  test('fetchPkg()', async () => {
    const env = {NPM_REGISTRY: 'https://registry.npmjs.org'}
    const temp = tempy.temporaryDirectory()
    const pkg = {
      name: '@semrel-extra/zxbr-test-a',
      version: '1.9.0',
      absPath: temp,
      config: parseEnv(env)
    }
    await fetchPkg(pkg)

    // https://www.npmjs.com/package/@semrel-extra/zxbr-test-a/v/1.9.0
    expect((await fs.readFile(`${temp}/random.txt`, 'utf-8')).trim()).toEqual(`vcbf\nfffff`)
  })

  test('fetchPkg() handles 404 gracefully (tag exists but pkg not published)', async () => {
    const env = {NPM_REGISTRY: 'https://registry.npmjs.org'}
    const temp = tempy.temporaryDirectory()
    const pkg = {
      name: 'depseek',
      version: '999.999.999',
      absPath: temp,
      config: parseEnv(env)
    }

    await fetchPkg(pkg)
    expect(pkg.fetched).toBeFalsy()
  })

  test('getNpmrc() writes authToken to temp file', async () => {
    const npmrc = await getNpmrc({
      npmToken: 'test-token-123',
      npmRegistry: 'https://registry.npmjs.org'
    })

    const content = await fs.readFile(npmrc, 'utf-8')
    expect(content.includes('//registry.npmjs.org/:_authToken=test-token-123')).toBeTruthy()
  })

  test('getNpmrc() returns npmConfig path when provided', async () => {
    const customPath = tempy.temporaryFile({name: '.npmrc'})
    await fs.writeFile(customPath, '//custom/:_authToken=foo')

    const npmrc = await getNpmrc({
      npmConfig: customPath,
      npmToken: 'ignored',
      npmRegistry: 'https://registry.npmjs.org'
    })

    expect(npmrc).toBe(customPath)
  })

  test('npmPublished() asks the registry the way publish reaches it, the parcel\'s name after --', () => within(async () => {
    const mock = createSpawnMock([['npm view', '1.0.0']])
    $.spawn = mock.spawn
    $.quiet = true
    const npmrc = tempy.temporaryFile({name: '.npmrc'})

    expect(await npmPublished({name: '@scope/pkg', version: '1.0.0', config: {npmRegistry: 'https://r.example', npmConfig: npmrc}})).toBe(true)
    expect(await npmPublished({name: '@scope/pkg', version: '1.0.1', config: {npmRegistry: 'https://r.example', npmOidc: true}})).toBe(false)

    const views = mock.calls.filter(c => c.includes('npm view'))
    expect(views[0]).toContain(`npm view --registry=https://r.example --userconfig=${npmrc} -- @scope/pkg@1.0.0 version`)
    expect(views[1]).toContain('npm view --registry=https://r.example -- @scope/pkg@1.0.1 version')
  }))
})
