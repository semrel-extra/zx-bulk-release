import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within, fs, path, tempy} from 'zx-extra'
import {createSpawnMock, defaultResponses, has} from './utils/mock.js'
import {packTar} from '../../main/js/post/tar.js'

const test = suite('modes.deliver')

const writeTmpFile = async (content) => {
  const p = path.join(tempy.temporaryDirectory(), 'file')
  await fs.writeFile(p, content)
  return p
}

test('delivers tars and reports counts', async () => {
  await within(async () => {
    const mock = createSpawnMock(defaultResponses())
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false

    const {runDeliver} = await import(`../../main/js/post/modes/deliver.js?t=${Date.now()}`)
    const {channels} = await import(`../../main/js/post/courier/index.js?t=${Date.now()}`)

    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, 'parcel.abc1234.npm.pkg.1.0.0.aaa111.tar')
    await packTar(tarPath, {
      channel: 'npm', name: 'pkg', version: '1.0.0',
      token: '${{NPM_TOKEN}}', registry: '${{NPM_REGISTRY}}',
    }, [{name: 'package.tgz', source: await writeTmpFile('fake')}])

    const origRun = channels.npm.run
    channels.npm.run = async () => {}
    try {
      await runDeliver({env: {NPM_TOKEN: 'tok', NPM_REGISTRY: 'https://r.com', PATH: process.env.PATH}, flags: {deliver: dir}})
    } finally {
      channels.npm.run = origRun
    }
  })
})

test('handles empty dir gracefully', async () => {
  await within(async () => {
    const mock = createSpawnMock(defaultResponses())
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false

    const {runDeliver} = await import(`../../main/js/post/modes/deliver.js?t=${Date.now()}`)

    const dir = tempy.temporaryDirectory()
    await runDeliver({env: {PATH: process.env.PATH}, flags: {deliver: dir}})
  })
})

test('ensureGitRepo creates temp repo when no git repo exists', async () => {
  await within(async () => {
    const mock = createSpawnMock([
      ['git rev-parse --show-toplevel', '', 128],  // fail -> trigger fallback
      ['git init', ''],
      [/git remote/, ''],
      ...defaultResponses(),
    ])
    $.spawn = mock.spawn
    $.quiet = true
    $.verbose = false

    const {runDeliver} = await import(`../../main/js/post/modes/deliver.js?t=${Date.now()}`)
    const {channels} = await import(`../../main/js/post/courier/index.js?t=${Date.now()}`)

    const dir = tempy.temporaryDirectory()
    const tarPath = path.join(dir, 'parcel.abc1234.npm.pkg.1.0.0.aaa111.tar')
    await packTar(tarPath, {
      channel: 'npm', name: 'pkg', version: '1.0.0',
      token: '${{NPM_TOKEN}}', registry: '${{NPM_REGISTRY}}',
    }, [{name: 'package.tgz', source: await (async () => {
      const p = path.join(tempy.temporaryDirectory(), 'file')
      await fs.writeFile(p, 'fake')
      return p
    })()}])

    const origRun = channels.npm.run
    channels.npm.run = async () => {}
    try {
      await runDeliver({
        env: {
          NPM_TOKEN: 'tok',
          NPM_REGISTRY: 'https://r.com',
          PATH: process.env.PATH,
          GITHUB_REPOSITORY: 'org/repo',
          GH_TOKEN: 'tok',
          GITHUB_SERVER_URL: 'https://github.com',
        },
        flags: {deliver: dir}
      })

      assert.ok(has(mock.calls, 'git init'))
    } finally {
      channels.npm.run = origRun
    }
  })
})

test.run()
