import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {fetchManifest} from '../../main/js/npm.js'

const test = suite('npm')

test('fetchManifest()', async () => {
  const env = {NPM_REGISTRY: 'https://registry.npmjs.org'}
  const manifest = await fetchManifest({
    name: 'ggcp',
    version: '1.5.0'
  }, {env})
  assert.ok(manifest.name === 'ggcp')

  const notfound = await fetchManifest({
    name: '@qiwi/sf2332f-32ds2213-dfs23',
    version: '999.15.0'
  }, {nothrow: true, env})
  assert.is(notfound, null)
})

test.run()
