// Smoke: public API surface loads under any supported Node version.
// Plain assertions + process.exit. No test framework.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'

const pkg = createRequire(import.meta.url)('../../../package.json')

try {
  const m = await import('../../main/js/index.js')
  assert.equal(typeof m.run, 'function')
  assert.equal(typeof m.version, 'string')
  assert.equal(m.version, pkg.version)

  const repo = await import('../../test/js/utils/repo.js')
  assert.equal(typeof repo.createFakeRepo, 'function')

  const meta = await import('../../main/js/post/depot/generators/meta.js')
  assert.equal(typeof meta, 'object')

  const {parseEnv} = await import('../../main/js/config.js')
  const env = parseEnv({GH_TOKEN: 't', NPM_TOKEN: 'n'})
  assert.equal(env.ghToken, 't')
  assert.equal(env.npmToken, 'n')

  const {tpl, get, set, queuefy, pool} = await import('../../main/js/util.js')
  assert.equal(tpl('${{name}}', {name: 'x'}), 'x')
  const obj = {}
  set(obj, 'a.b', 1)
  assert.equal(get(obj, 'a.b'), 1)
  assert.equal(typeof queuefy, 'function')
  assert.equal(typeof pool, 'function')

  console.log('smoke/api: ok')
  process.exit(0)
} catch (e) {
  console.error('smoke/api: FAIL')
  console.error(e)
  process.exit(1)
}
