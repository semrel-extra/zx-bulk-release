import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {fetchManifest, fetchPkg, getNpmrc} from '../../main/js/processor/api/npm.js'
import {tempy, fs} from 'zx-extra'
import {parseEnv} from '../../main/js/config.js'

const test = suite('npm')

test('fetchManifest()', async () => {
  const env = {NPM_REGISTRY: 'https://registry.npmjs.org'}
  const config = parseEnv(env)
  const manifest = await fetchManifest({
    name: 'ggcp',
    version: '1.5.0',
    config
  })
  assert.ok(manifest.name === 'ggcp')

  const notfound = await fetchManifest({
    name: '@qiwi/sf2332f-32ds2213-dfs23',
    version: '999.15.0',
    config
  }, {nothrow: true})
  assert.is(notfound, null)
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
  assert.equal((await fs.readFile(`${temp}/random.txt`, 'utf-8')).trim(), `vcbf
fffff`)
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

  // Should not throw — 404 is caught and logged as warning
  await fetchPkg(pkg)
  assert.ok(!pkg.fetched, 'pkg.fetched should remain falsy on 404')
})

test('getNpmrc() writes authToken to temp file', async () => {
  const npmrc = await getNpmrc({
    npmToken: 'test-token-123',
    npmRegistry: 'https://registry.npmjs.org'
  })

  const content = await fs.readFile(npmrc, 'utf-8')
  assert.ok(content.includes('//registry.npmjs.org/:_authToken=test-token-123'))
})

test('getNpmrc() returns npmConfig path when provided', async () => {
  const customPath = tempy.temporaryFile({name: '.npmrc'})
  await fs.writeFile(customPath, '//custom/:_authToken=foo')

  const npmrc = await getNpmrc({
    npmConfig: customPath,
    npmToken: 'ignored',
    npmRegistry: 'https://registry.npmjs.org'
  })

  assert.is(npmrc, customPath)
})

test.run()
