import {describe, test, expect} from 'vitest'
import {fetchManifest, fetchPkg, getNpmrc, npmPublished, npmPersist, npmRestore} from '../../main/js/post/api/npm.js'
import {$, within, tempy, fs, path} from 'zx-extra'
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

  test('getNpmrc() keys the token by the default registry when none is set, as npm looks it up', async () => {
    for (const npmRegistry of ['', undefined]) {
      const npmrc = await getNpmrc({npmToken: `t-${npmRegistry}`, npmRegistry})
      expect(await fs.readFile(npmrc, 'utf-8')).toBe(`//registry.npmjs.org/:_authToken=t-${npmRegistry}`)
    }
    const slashed = await getNpmrc({npmToken: 't', npmRegistry: 'https://r.example/npm/'})
    expect(await fs.readFile(slashed, 'utf-8')).toBe('//r.example/npm/:_authToken=t')
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

  // npm in a sibling package reads this manifest meanwhile: it must never see it truncated.
  describe('npmPersist() / npmRestore() replace the manifest whole', () => {
    const raw = '{"name":"a","version":"1.0.0"}'
    const setup = async () => {
      const dir = tempy.temporaryDirectory()
      const file = path.join(dir, 'package.json')
      await fs.writeFile(file, raw)
      await fs.chmod(file, 0o640)
      return {dir, file, pkg: {name: 'a', version: '1.0.1', manifest: {name: 'a', version: '1.0.1'}, manifestRaw: raw, manifestAbsPath: file}}
    }

    test('a new file takes the place of the old one, which stays intact for its readers', async () => {
      const {dir, file, pkg} = await setup()
      const reader = await fs.promises.open(file, 'r')

      await npmPersist(pkg)
      expect(await reader.readFile('utf8')).toBe(raw)
      await reader.close()
      expect(await fs.readFile(file, 'utf8')).toBe('{\n  "name": "a",\n  "version": "1.0.1"\n}\n')
      expect((await fs.stat(file)).mode & 0o777).toBe(0o640)

      await npmRestore(pkg)
      expect(await fs.readFile(file, 'utf8')).toBe(raw)
      expect(await fs.readdir(dir)).toEqual(['package.json'])
    })

    test('a symlinked manifest stays a symlink', async () => {
      const {dir, file, pkg} = await setup()
      const real = path.join(dir, 'real.json')
      await fs.move(file, real)
      await fs.symlink('real.json', file)

      await npmPersist(pkg)
      expect((await fs.lstat(file)).isSymbolicLink()).toBe(true)
      expect((await fs.readJson(real)).version).toBe('1.0.1')
    })

    test('a failed replace leaves no temp file behind', async () => {
      const {dir, pkg} = await setup()
      const file = path.join(dir, 'pkg.json')
      await fs.outputFile(path.join(file, 'x'), '')

      await expect(npmPersist({...pkg, manifestAbsPath: file})).rejects.toThrow()
      expect(await fs.readdir(dir)).toEqual(['package.json', 'pkg.json'])
    })
  })
})
