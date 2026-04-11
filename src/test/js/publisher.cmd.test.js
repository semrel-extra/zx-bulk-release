import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import cmd from '../../main/js/courier/publishers/cmd.js'
import {makePkg} from './utils/mock.js'

const test = suite('publisher.cmd')

test('when checks publishCmd', () => {
  const pkg1 = {config: {publishCmd: 'echo pub'}, ctx: {flags: {}}}
  const pkg2 = {config: {}, ctx: {flags: {publishCmd: 'echo pub'}}}
  const pkg3 = {config: {}, ctx: {flags: {}}}

  assert.is(cmd.when(pkg1), true)
  assert.is(cmd.when(pkg2), true)
  assert.is(cmd.when(pkg3), false)
  assert.is(cmd.name, 'cmd')
  assert.is(cmd.snapshot, true)
})

test('run calls exec with publishCmd', async () => {
  const ran = []
  const exec = async (pkg, name) => ran.push(name)
  const pkg = makePkg()
  await cmd.run(pkg, exec)
  assert.ok(ran.includes('publishCmd'))
})

test.run()
