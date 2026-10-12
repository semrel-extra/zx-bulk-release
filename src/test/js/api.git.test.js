import {describe, test, expect} from 'vitest'
import {$, within, fs, path, tempy} from 'zx-extra'

import {identity, pushTag, pushCommit, fetchRepo, getRemoteTagCommit, isAncestor, openRepo, listRemoteTags, deepen} from '../../main/js/post/api/git.js'
import {createFakeRepo, addCommits} from './utils/repo.js'
import {createSpawnMock} from './utils/mock.js'

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

  // The developer's own GIT_AUTHOR_*/GIT_COMMITTER_* would win over the identity a test passes.
  const withoutIdentity = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_(AUTHOR|COMMITTER)_/.test(k)))

  const show = async (origin, ref, format) =>
    (await $`git --git-dir=${origin} log --format=${format} ${ref}`).toString().trim().split('\n')

  const headOf = async (cwd) => (await $({cwd})`git rev-parse HEAD`).toString()

  test('pushTag() claims a tag at the given commit', async () => {
    const cwd = await setupRepo()
    const sha = await headOf(cwd)

    expect(await pushTag({cwd, tag: '1.0.0-test', sha})).toEqual({pushed: true, commit: sha})
    expect(await getRemoteTagCommit(cwd, '1.0.0-test')).toBe(sha)
  })

  test('pushTag() reports where an existing tag points instead of throwing', async () => {
    const cwd = await setupRepo()
    const first = await headOf(cwd)
    await addCommits({cwd, commits: [{msg: 'fix: next', files: [{relpath: 'next.txt', contents: 'next'}]}]})
    const second = await headOf(cwd)

    await pushTag({cwd, tag: '1.0.0-dup', sha: first})
    expect(await pushTag({cwd, tag: '1.0.0-dup', sha: second})).toEqual({pushed: false, commit: first})
  })

  test('pushTag() tags as the given identity and keeps repo config', () => within(async () => {
    $.env = withoutIdentity()
    const cwd = await setupRepo()

    await pushTag({cwd, tag: '1.0.0-who', sha: await headOf(cwd), gitCommitterName: 'Tagger', gitCommitterEmail: 'tagger@test.com'})

    const format = '--format=%(taggername)/%(taggeremail)'
    const tagger = (await $({cwd})`git for-each-ref ${format} refs/tags/1.0.0-who`).toString().trim()
    expect(tagger).toBe('Tagger/<tagger@test.com>')
    expect((await $({cwd})`git config --local --get user.name`).toString().trim()).toBe('Semrel-extra Bot')
  }))

  test('identity() fills in the release identity, identity vars of the env win', () => within(() => {
    $.env = {}
    expect(identity()).toEqual({
      GIT_AUTHOR_NAME: 'Semrel Extra Bot', GIT_AUTHOR_EMAIL: 'semrel-extra-bot@hotmail.com',
      GIT_COMMITTER_NAME: 'Semrel Extra Bot', GIT_COMMITTER_EMAIL: 'semrel-extra-bot@hotmail.com',
    })
    expect(identity('Bot', 'bot@test.com')).toMatchObject({GIT_AUTHOR_NAME: 'Bot', GIT_AUTHOR_EMAIL: 'bot@test.com', GIT_COMMITTER_NAME: 'Bot'})

    $.env = {GIT_COMMITTER_NAME: 'Env', GIT_COMMITTER_EMAIL: 'env@test.com'}
    expect(identity()).toMatchObject({GIT_AUTHOR_NAME: 'Env', GIT_AUTHOR_EMAIL: 'env@test.com', GIT_COMMITTER_NAME: 'Env'})

    $.env = {GIT_AUTHOR_NAME: 'Author'}
    expect(identity('Bot')).toMatchObject({GIT_AUTHOR_NAME: 'Author', GIT_COMMITTER_NAME: 'Bot'})
  }))

  test('openRepo() finds the checkout around cwd, or makes a fresh repo bound to origin', async () => {
    const cwd = await setupRepo()
    const root = (await $({cwd})`git rev-parse --show-toplevel`).toString()
    const origin = (await $({cwd})`git remote get-url origin`).toString()
    await fs.ensureDir(path.join(cwd, 'sub'))

    expect(await openRepo(path.join(cwd, 'sub'), 'unused')).toBe(root)

    const fresh = await openRepo(tempy.temporaryDirectory(), origin)
    expect(fresh).not.toBe(root)
    expect((await $({cwd: fresh})`git remote get-url origin`).toString()).toBe(origin)
    expect(await listRemoteTags(fresh)).toEqual([])
  })

  test('listRemoteTags() lists tag names without peeled entries', async () => {
    const cwd = await setupRepo()
    await $({cwd})`git tag -a -m a 1.0.0-a`
    await $({cwd})`git tag 1.0.0-b`
    await $({cwd})`git push origin 1.0.0-a 1.0.0-b`

    expect((await listRemoteTags(cwd)).sort()).toEqual(['1.0.0-a', '1.0.0-b'])
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
      $.env = withoutIdentity()
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

  test('deepen() fetches once per run and repo', () => within(async () => {
    const mock = createSpawnMock([['git rev-parse --show-toplevel', '/repo']])
    $.spawn = mock.spawn
    $.quiet = true
    $.memo = new Map()

    await Promise.all([deepen('/repo', 100), deepen('/repo/sub', 100)])
    await deepen('/repo', 100)
    expect(mock.calls.filter(c => c.includes('--deepen'))).toHaveLength(1)
  }))
})
