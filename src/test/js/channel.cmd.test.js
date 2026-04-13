import {describe, test, expect} from 'vitest'
import cmd from '../../main/js/post/courier/channels/cmd.js'
import {makePkg} from './utils/mock.js'

describe('channel.cmd', () => {
  test('when checks publishCmd', () => {
    const pkg1 = {config: {publishCmd: 'echo pub'}, ctx: {flags: {}}}
    const pkg2 = {config: {}, ctx: {flags: {publishCmd: 'echo pub'}}}
    const pkg3 = {config: {}, ctx: {flags: {}}}

    expect(cmd.when(pkg1)).toBe(true)
    expect(cmd.when(pkg2)).toBe(true)
    expect(cmd.when(pkg3)).toBe(false)
    expect(cmd.name).toBe('cmd')
    expect(cmd.snapshot).toBe(true)
  })

  test('run calls exec with publishCmd', async () => {
    const ran = []
    const exec = async (pkg, name) => ran.push(name)
    const pkg = makePkg()
    await cmd.run(pkg, exec)
    expect(ran.includes('publishCmd')).toBeTruthy()
  })

})
