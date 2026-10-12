import {describe, test, expect} from 'vitest'
import {$, fs, path, tempy} from 'zx-extra'
import {createRequire} from 'node:module'

describe('cli', () => {
  test('prints own version', async () => {
    const require = createRequire(import.meta.url)
    const version = (await $`node ${require.resolve('../../main/js/cli.js')} --version`).toString().trim()
    const expected = require('../../../package.json').version
    expect(version).toEqual(expected)
  })

  test('--help shows usage', async () => {
    const require = createRequire(import.meta.url)
    const help = (await $`node ${require.resolve('../../main/js/cli.js')} --help`).toString()
    expect(help.includes('--receive')).toBeTruthy()
    expect(help.includes('--pack')).toBeTruthy()
    expect(help.includes('--verify')).toBeTruthy()
    expect(help.includes('--deliver')).toBeTruthy()
    expect(help.includes('--dry-run')).toBeTruthy()
  })

  test('a failed command is printed once and its exit code is kept', async () => {
    const require = createRequire(import.meta.url)
    const cwd = tempy.temporaryDirectory()
    await fs.writeJson(path.join(cwd, 'package.json'), {name: 'not-a-repo', version: '1.0.0'})

    const res = await $({cwd, nothrow: true})`node ${require.resolve('../../main/js/cli.js')} --receive`
    expect(res.exitCode).toBe(128)
    expect(res.stderr.match(/not a git repository/gi)?.length).toBe(1)
  })

})
