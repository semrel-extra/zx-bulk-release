// Smoke: CLI boots, prints help/version, exits cleanly. No test framework.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'

const cli = fileURLToPath(new URL('../../main/js/cli.js', import.meta.url))
const pkg = createRequire(import.meta.url)('../../../package.json')

const exec = (args) => spawnSync(process.execPath, [cli, ...args], {
  encoding: 'utf8',
  timeout: 10_000,
})

try {
  for (const flag of ['--version', '-v']) {
    const r = exec([flag])
    assert.equal(r.status, 0, `${flag}: exit ${r.status}, stderr: ${r.stderr}`)
    assert.equal(r.stdout.trim(), pkg.version, `${flag}: got "${r.stdout.trim()}"`)
  }

  const h = exec(['--help'])
  assert.equal(h.status, 0, `--help: exit ${h.status}, stderr: ${h.stderr}`)
  assert.match(h.stdout, /Usage: npx zx-bulk-release/)
  for (const mode of ['--receive', '--pack', '--verify', '--deliver']) {
    assert.match(h.stdout, new RegExp(mode.replace(/-/g, '\\-')), `--help missing ${mode}`)
  }

  console.log('smoke/cli: ok')
  process.exit(0)
} catch (e) {
  console.error('smoke/cli: FAIL')
  console.error(e)
  process.exit(1)
}
