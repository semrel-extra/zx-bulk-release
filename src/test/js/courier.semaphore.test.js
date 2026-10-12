import {describe, test, expect} from 'vitest'
import {$, within, fs, path, tempy} from 'zx-extra'
import {tryLock, unlock, signalRebuild, consumeRebuildSignal} from '../../main/js/post/courier/semaphore.js'
import {openRepo, getRemoteTagCommit} from '../../main/js/post/api/git.js'
import {createFakeRepo} from './utils/repo.js'

describe('courier.semaphore', () => {
  // A release commit on origin and a fresh delivery repo, as on a runner without a checkout.
  const setup = async () => {
    const work = await createFakeRepo({commits: [{msg: 'feat: a', files: [{relpath: 'a.txt', contents: 'a'}]}]})
    await $({cwd: work})`git push origin HEAD:master`
    const sha = (await $({cwd: work})`git rev-parse HEAD`).toString()
    const origin = (await $({cwd: work})`git remote get-url origin`).toString()
    const fresh = () => openRepo(tempy.temporaryDirectory(), origin)
    return {origin, sha, fresh, cwd: await fresh(), directive: {sha, timestamp: 1700000000, queue: ['pkg-a']}}
  }
  const lockOf = (sha) => `zbr-deliver.${sha.slice(0, 7)}`
  const rebuildOf = (sha) => `zbr-rebuild.${sha.slice(0, 7)}`

  test('tryLock tags the release commit as GIT_COMMITTER_*, with no commits or config of its own', async () => {
    await within(async () => {
      $.env = {...process.env, GIT_COMMITTER_NAME: 'Lock Bot', GIT_COMMITTER_EMAIL: 'lock@test.com'}
      const {cwd, sha, directive} = await setup()

      expect(await tryLock(cwd, directive)).toBe(true)
      expect(await getRemoteTagCommit(cwd, lockOf(sha))).toBe(sha)

      const format = '--format=%(taggername)/%(taggeremail)'
      expect((await $({cwd})`git for-each-ref ${format} refs/tags/${lockOf(sha)}`).toString()).toBe('Lock Bot/<lock@test.com>')
      expect((await $({cwd, nothrow: true})`git rev-parse --verify -q HEAD`).exitCode).toBe(1)
      expect((await $({cwd, nothrow: true})`git config --local --get user.name`).exitCode).toBe(1)
    })
  })

  test('only one runner gets the lock, even within the same second', async () => {
    await within(async () => {
      $.env = {...process.env, GIT_COMMITTER_DATE: '1700000000 +0000'}
      const {cwd, fresh, directive} = await setup()

      expect(await tryLock(cwd, directive)).toBe(true)
      expect(await tryLock(await fresh(), directive)).toBe(false)
    })
  })

  test('unlock frees the lock for the next run', async () => {
    const {cwd, fresh, sha, directive} = await setup()

    expect(await tryLock(cwd, directive)).toBe(true)
    await unlock(cwd, directive)
    expect(await getRemoteTagCommit(cwd, lockOf(sha))).toBe(null)
    expect(await tryLock(await fresh(), directive)).toBe(true)
  })

  test('tryLock throws when the push is rejected and nobody holds the lock', async () => {
    const {origin, cwd, directive} = await setup()
    await fs.outputFile(path.join(origin, 'hooks/pre-receive'), '#!/bin/sh\necho "tags are protected" >&2\nexit 1\n', {mode: 0o755})

    await expect(tryLock(cwd, directive)).rejects.toThrow(/tags are protected/)
  })

  test('signalRebuild tags the release commit, a second signal is a no-op', async () => {
    const {cwd, fresh, sha} = await setup()

    await signalRebuild(cwd, sha)
    await signalRebuild(await fresh(), sha)
    expect(await getRemoteTagCommit(cwd, rebuildOf(sha))).toBe(sha)

    await consumeRebuildSignal(cwd, sha)
    expect(await getRemoteTagCommit(cwd, rebuildOf(sha))).toBe(null)
  })
})
