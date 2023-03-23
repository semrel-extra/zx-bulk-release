import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {fetchManifest, fetchPkg} from '../../main/js/npm.js'
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

test.run()
