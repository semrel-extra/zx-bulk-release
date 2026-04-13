import {describe, test, expect} from 'vitest'
import {$} from 'zx-extra'
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

})
