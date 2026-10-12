import {describe, test, expect} from 'vitest'
import {$, within, fs, path, tempy} from 'zx-extra'

import {pushTag, pushCommit, fetchRepo, getRemoteTagCommit, isAncestor} from '../../main/js/post/api/git.js'
import {createFakeRepo, addCommits} from './utils/repo.js'

describe('api.git', () => {
  const setupRepo = async () => {
    const cwd = await createFakeRepo({commits: [
      {
        msg: 'feat: initial',
        files: [{relpath: 'file.txt', contents: 'hello'}]
      }
    ]})
    await $({cwd})`git push origin HEAD`
    return cwd
  }

  const setupOrigin = async () => {
    const origin = tempy.temporaryDirectory()
    await $`git init --bare ${origin}`
    return origin
  }

  const show = async (origin, ref, format) =>
    (await $`git --git-dir=${origin} log --format=${format} ${ref}`).toString().trim().split('\n')

  test('pushTag() pushes a tag to remote', async () => {
    const cwd = await setupRepo()

    await pushTag({cwd, tag: '1.0.0-test', gitCommitterName: 'Test', gitCommitterEmail: 'test@test.com'})

    const remoteTags = (await $({cwd})`git ls-remote --tags origin`).toString()
    expect(remoteTags.includes('1.0.0-test')).toBeTruthy()
  })

  test('pushTag() throws when tag already exists in remote', async () => {
    const cwd = await setupRepo()

    await pushTag({cwd, tag: '1.0.0-dup', gitCommitterName: 'Test', gitCommitterEmail: 'test@test.com'})

    try {
      await pushTag({cwd, tag: '1.0.0-dup', gitCommitterName: 'Test', gitCommitterEmail: 'test@test.com'})
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e.message.includes('already exists') || e.exitCode === 1).toBeTruthy()
    }
  })

  test('pushTag() tags as the given identity and keeps repo config', async () => {
    const cwd = await setupRepo()

    await pushTag({cwd, tag: '1.0.0-who', gitCommitterName: 'Tagger', gitCommitterEmail: 'tagger@test.com'})

    const format = '--format=%(taggername)/%(taggeremail)'
    const tagger = (await $({cwd})`git for-each-ref ${format} refs/tags/1.0.0-who`).toString().trim()
    expect(tagger).toBe('Tagger/<tagger@test.com>')
    expect((await $({cwd})`git config --local --get user.name`).toString().trim()).toBe('Semrel-extra Bot')
  })

  test('pushCommit() lands concurrent commits to one branch', async () => {
    await within(async () => {
      $.memo = new Map()
      const origin = await setupOrigin()

      const results = await Promise.all(['a', 'b', 'c'].map(name => pushCommit({
        origin, branch: 'docs', msg: `add ${name}`,
        files: [{relpath: `${name}.txt`, contents: name}],
      })))

      expect(results).toEqual(['ok', 'ok', 'ok'])
      expect((await show(origin, 'docs', '%s')).sort()).toEqual(['add a', 'add b', 'add c'])
    })
  })

  test('pushCommit() commits as the given identity and writes no repo config', async () => {
    await within(async () => {
      $.memo = new Map()
      const origin = await setupOrigin()

      await pushCommit({
        origin, branch: 'docs', msg: 'docs',
        files: [{relpath: 'a.txt', contents: 'a'}],
        gitCommitterName: 'Bot', gitCommitterEmail: 'bot@test.com',
      })

      expect(await show(origin, 'docs', '%an/%ae/%cn/%ce')).toEqual(['Bot/bot@test.com/Bot/bot@test.com'])
      const clone = await fetchRepo({origin, branch: 'docs'})
      expect((await $({cwd: clone, nothrow: true})`git config --local --get user.name`).exitCode).toBe(1)
    })
  })

  test('pushCommit() passes previous contents to a contents function', async () => {
    await within(async () => {
      $.memo = new Map()
      const origin = await setupOrigin()

      for (const v of ['one', 'two']) await pushCommit({
        origin, branch: 'changelog', msg: v,
        files: [{relpath: 'CHANGELOG.md', contents: (prev) => v + '\n' + prev}],
      })

      expect((await $`git --git-dir=${origin} show changelog:CHANGELOG.md`).stdout).toBe('two\none\n')
    })
  })

  test('pushCommit() builds on the remote tip when its clone is stale', async () => {
    await within(async () => {
      const memo = $.memo = new Map()
      const origin = await setupOrigin()
      const prepend = (v) => ({origin, branch: 'changelog', msg: v, files: [{relpath: 'CHANGELOG.md', contents: (prev) => v + '\n' + prev}]})

      await pushCommit(prepend('one'))
      $.memo = new Map() // another process: own clone
      await pushCommit(prepend('other'))
      $.memo = memo
      await pushCommit(prepend('two'))

      expect((await $`git --git-dir=${origin} show changelog:CHANGELOG.md`).stdout).toBe('two\nother\none\n')
    })
  })

  test('pushCommit() reports unchanged contents without a commit', async () => {
    await within(async () => {
      $.memo = new Map()
      const origin = await setupOrigin()
      const opts = {origin, branch: 'meta', msg: 'meta', files: [{relpath: 'meta.json', contents: {a: 1}}]}

      expect(await pushCommit(opts)).toBe('ok')
      expect(await pushCommit(opts)).toBe('unchanged')
      expect(await show(origin, 'meta', '%s')).toEqual(['meta'])
    })
  })

  test('pushCommit() throws when the commit fails', async () => {
    await within(async () => {
      $.memo = new Map()
      const origin = await setupOrigin()
      const hooks = tempy.temporaryDirectory()
      await fs.outputFile(path.join(hooks, 'pre-commit'), '#!/bin/sh\nexit 1\n', {mode: 0o755})
      $.env = {...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: hooks}

      await expect(pushCommit({
        origin, branch: 'docs', msg: 'docs',
        files: [{relpath: 'a.txt', contents: 'a'}],
      })).rejects.toThrow(/pre-commit|exit code/)
    })
  })

  test('getRemoteTagCommit() returns the commit of annotated and lightweight tags', async () => {
    const cwd = await setupRepo()
    const sha = (await $({cwd})`git rev-parse HEAD`).toString().trim()
    await $({cwd})`git tag -a -m annotated annotated`
    await $({cwd})`git tag lightweight`
    await $({cwd})`git push origin annotated lightweight`

    expect(await getRemoteTagCommit(cwd, 'annotated')).toBe(sha)
    expect(await getRemoteTagCommit(cwd, 'lightweight')).toBe(sha)
    expect(await getRemoteTagCommit(cwd, 'absent')).toBe(null)
  })

  test('isAncestor() compares commits and throws on unknown ones', async () => {
    const cwd = await setupRepo()
    const first = (await $({cwd})`git rev-parse HEAD`).toString().trim()
    await addCommits({cwd, commits: [{msg: 'fix: next', files: [{relpath: 'next.txt', contents: 'next'}]}]})
    const second = (await $({cwd})`git rev-parse HEAD`).toString().trim()

    expect(await isAncestor(cwd, first, second)).toBe(true)
    expect(await isAncestor(cwd, second, first)).toBe(false)
    await expect(isAncestor(cwd, 'f'.repeat(40), second)).rejects.toThrow()
  })
})
