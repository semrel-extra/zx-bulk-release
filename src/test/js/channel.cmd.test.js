import {describe, test, expect} from 'vitest'
import {$, within, fs, path, tempy} from 'zx-extra'
import cmd from '../../main/js/post/courier/channels/cmd.js'
import {exec} from '../../main/js/post/depot/exec.js'
import {makePkg} from './utils/mock.js'
import {createFakeRepo} from './utils/repo.js'

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

  // No git identity anywhere, like on GitHub-hosted runners, but the same on every machine.
  const noIdentity = async () => {
    const home = tempy.temporaryDirectory()
    await fs.outputFile(path.join(home, '.gitconfig'), '[user]\n\tuseConfigOnly = true\n')
    $.env = {PATH: process.env.PATH, HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'), GIT_CONFIG_NOSYSTEM: '1'}
    const cwd = await createFakeRepo({commits: [{msg: 'feat: a', files: [{relpath: 'a.txt', contents: 'a'}]}]})
    await $({cwd})`git config --unset user.name && git config --unset user.email`
    const pkg = {absPath: cwd, config: {publishCmd: 'git commit --allow-empty -qm pub && git tag -a -m pub v1'}, ctx: {flags: {}}}
    return {cwd, pkg}
  }
  const who = async (cwd) => (await $({cwd})`git log -1 --format=%an/%ae/%cn/%ce`).toString()
  const tagger = async (cwd) => {
    const format = '--format=%(taggername)/%(taggeremail)'
    return (await $({cwd})`git for-each-ref ${format} refs/tags/v1`).toString()
  }

  test('publishCmd commits and tags as the release where git has no identity', () => within(async () => {
    const {cwd, pkg} = await noIdentity()

    await expect(exec(pkg, 'publishCmd')).rejects.toThrow()
    await cmd.run(pkg, exec)

    expect(await who(cwd)).toBe('Semrel Extra Bot/semrel-extra-bot@hotmail.com/Semrel Extra Bot/semrel-extra-bot@hotmail.com')
    expect(await tagger(cwd)).toBe('Semrel Extra Bot/<semrel-extra-bot@hotmail.com>')
    expect((await $({cwd, nothrow: true})`git config --local --get user.name`).exitCode).toBe(1)
  }))

  test.each([
    ['GIT_COMMITTER_*', {GIT_COMMITTER_NAME: 'Env Bot', GIT_COMMITTER_EMAIL: 'env@test.com'}, 'Env Bot/env@test.com/Env Bot/env@test.com'],
    ['GIT_AUTHOR_*', {GIT_AUTHOR_NAME: 'Author', GIT_AUTHOR_EMAIL: 'author@test.com'}, 'Author/author@test.com/Semrel Extra Bot/semrel-extra-bot@hotmail.com'],
  ])('publishCmd keeps the identity set by %s', (_, vars, expected) => within(async () => {
    const {cwd, pkg} = await noIdentity()
    Object.assign($.env, vars)

    await cmd.run(pkg, exec)
    expect(await who(cwd)).toBe(expected)
  }))

  test('a snapshot publishCmd runs with the user\'s own identity, as before', () => within(async () => {
    const {pkg} = await noIdentity()
    pkg.ctx.flags.snapshot = true

    await expect(cmd.run(pkg, exec)).rejects.toThrow()
  }))
})
