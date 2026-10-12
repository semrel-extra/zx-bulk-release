import {describe, test, expect} from 'vitest'
import {$, within, fs, path, tempy} from 'zx-extra'
import gitTag from '../../main/js/post/courier/channels/git-tag.js'
import {openRepo, getRemoteTagCommit} from '../../main/js/post/api/git.js'
import {createFakeRepo} from './utils/repo.js'

describe('channel.git-tag', () => {
  // Origin with three commits; deliver runs from a fresh repo, as on a runner without a checkout.
  const setup = async () => {
    const cwd = await createFakeRepo({commits: ['1', '2', '3'].map(i => ({msg: `fix: ${i}`, files: [{relpath: `${i}.txt`, contents: i}]}))})
    await $({cwd})`git push origin HEAD:master`
    const origin = (await $({cwd})`git remote get-url origin`).toString()
    const [c3, c2, c1] = (await $({cwd})`git rev-list HEAD`).toString().split('\n')
    const fresh = () => openRepo(tempy.temporaryDirectory(), origin)
    return {cwd, origin, fresh, gitRoot: await fresh(), c1, c2, c3}
  }

  const claim = (gitRoot, tag, sha, who = 'Bot') =>
    gitTag.run({tag, sha, gitCommitterName: who, gitCommitterEmail: 'bot@test.com'}, null, {gitRoot})

  test('claims a free tag at the release commit, even if master has moved on', async () => {
    const {gitRoot, c1} = await setup()

    expect(await claim(gitRoot, 'v1', c1)).toBe('ok')
    expect(await getRemoteTagCommit(gitRoot, 'v1')).toBe(c1)
  })

  test('a tag at our commit is a duplicate, so a re-run passes', () => within(async () => {
    // another tagger makes another tag object; the developer's GIT_COMMITTER_* would override it
    $.env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_(AUTHOR|COMMITTER)_/.test(k)))
    const {gitRoot, fresh, c1} = await setup()

    expect(await claim(gitRoot, 'v1', c1)).toBe('ok')
    expect(await claim(await fresh(), 'v1', c1, 'Rerun Bot')).toBe('duplicate')
  }))

  test('a tag at another commit is a conflict, lightweight or annotated', async () => {
    const {cwd, gitRoot, c1, c2, c3} = await setup()
    await $({cwd})`git tag lightweight ${c3}`
    await $({cwd})`git tag -a -m annotated annotated ${c2}`
    await $({cwd})`git push origin lightweight annotated`

    expect(await claim(gitRoot, 'lightweight', c1)).toBe('conflict')
    expect(await claim(gitRoot, 'annotated', c1)).toBe('conflict')
  })

  test('a rejected push leaves no tag and throws', async () => {
    const {origin, gitRoot, c1} = await setup()
    await fs.outputFile(path.join(origin, 'hooks/pre-receive'), '#!/bin/sh\necho "tags are protected" >&2\nexit 1\n', {mode: 0o755})

    await expect(claim(gitRoot, 'v1', c1)).rejects.toThrow(/tags are protected/)
  })

  test('parallel claims in one repo all land', async () => {
    const {gitRoot, c1} = await setup()
    const tags = Array.from({length: 10}, (_, i) => `pkg-${i}@1.0.0`)

    expect(await Promise.all(tags.map(tag => claim(gitRoot, tag, c1)))).toEqual(tags.map(() => 'ok'))
    for (const tag of tags) expect(await getRemoteTagCommit(gitRoot, tag)).toBe(c1)
  })

  test('when checks snapshot flag', () => {
    expect(gitTag.when({ctx: {flags: {snapshot: true}}})).toBe(false)
    expect(gitTag.when({ctx: {flags: {}}})).toBe(true)
    expect(gitTag.when({ctx: {}})).toBe(true)
    expect(gitTag.when({})).toBe(true)
  })
})
