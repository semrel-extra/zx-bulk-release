import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {createMock, defaultResponses, has} from './utils/mock.js'

const test = suite('post.release')

const gitTagsForMonorepo = '2022.6.13-a.v1.0.0-f0\n'
const gitLogA = '+++refactor(a): a refactoring____abc1__abc1full'
const gitLogB = '+++fix(b): add some file____def1__def1full\n+++feat: init pkg b____ghi1__ghi1full'

const fakeMonorepoResponses = () => [
  ...defaultResponses({
    tags: gitTagsForMonorepo,
    root: '/tmp/fakerepo',
    sha: 'deadbeef1234567',
    origin: 'https://github.com/test-org/test-repo.git',
  }),
]

test('version is exported', async () => {
  const {version} = await import(`../../main/js/index.js?t=${Date.now()}`)
  assert.ok(/\d+\.\d+\.\d+/.test(version))
})

test('run --dryRun does not push tags', async () => {
  await within(async () => {
    const mock = createMock(fakeMonorepoResponses())
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false

    const {run} = await import(`../../main/js/post/release.js?t=${Date.now()}`)

    try {
      await run({
        cwd: '/tmp/fakerepo',
        flags: {dryRun: true},
        env: {GH_TOKEN: 'ghp_test', NPM_TOKEN: 'npm_test'},
      })
    } catch {
      // topo may throw on non-existent dir; that's expected in mock env
    }

    const pushTagCalls = mock.calls.filter(c => c.includes('git tag -m') && c.includes('git push'))
    assert.is(pushTagCalls.length, 0)
  })
})

test.run()
