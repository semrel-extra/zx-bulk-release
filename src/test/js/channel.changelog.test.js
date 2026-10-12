import {describe, test, expect} from 'vitest'
import {$, within, tempy} from 'zx-extra'
import changelog from '../../main/js/post/courier/channels/changelog.js'
import {openRepo} from '../../main/js/post/api/git.js'

describe('channel.changelog', () => {
  test('when checks changelog config', () => {
    expect(changelog.when({config: {changelog: 'changelog'}})).toBe(true)
    expect(changelog.when({config: {}})).toBe(false)
    expect(changelog.name).toBe('changelog')
  })

  test('run() prepends release notes once, even if delivered again', async () => {
    await within(async () => {
      $.memo = new Map()
      const origin = tempy.temporaryDirectory()
      await $`git init --bare ${origin}`
      const gitRoot = await openRepo(tempy.temporaryDirectory(), origin)
      const manifest = (version) => ({
        name: 'a', version, branch: 'changelog', file: 'CHANGELOG.md', msg: `chore: changelog ${version}`,
        releaseNotes: `## ${version}\n`, repoAuthedUrl: origin,
      })

      for (const version of ['1.0.0', '1.0.1', '1.0.1']) {
        expect(await changelog.run(manifest(version), tempy.temporaryDirectory(), {gitRoot})).toBe('ok')
      }

      expect((await $`git --git-dir=${origin} show changelog:CHANGELOG.md`).stdout).toBe('## 1.0.1\n\n## 1.0.0\n\n')
    })
  })
})
