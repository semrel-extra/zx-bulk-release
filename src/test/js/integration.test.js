import {suite} from 'uvu'
import * as assert from 'uvu/assert'

import {ctx, tempy, fs} from 'zx-extra'
import {run} from '../../main/js/index.js'
import {formatTag} from '../../main/js/tag.js'
import {createFakeRepo, createNpmRegistry} from './test-utils.js'

const test = suite('integration')

test('run()', async () => {
  const registry = createNpmRegistry()

  await registry.start()

  const cwd = await createFakeRepo({
    commits: [
      {
        msg: 'chore: initial commit',
        files: [
          {
            relpath: './README.md',
            contents: '#Readme'
          },
          {
            relpath: './package.json',
            contents: {
              name: 'root',
              workspaces: ['packages/*']
            }
          }
        ]
      },
      {
        msg: 'feat: init pkg a',
        files: [
          {
            relpath: './packages/a/package.json',
            contents: {
              name: 'a'
            }
          }
        ]
      },
      {
        msg: 'chore(a): some a update',
        files: [
          {
            relpath: './packages/a/foo.txt',
            contents: 'foo'
          }
        ]
      },
      {
        msg: 'chore(a): another a update',
        files: [
          {
            relpath: './packages/a/foo.txt',
            contents: 'foobar'
          }
        ],
        tags: ['2022.6.13-a.v1.0.0-f0']
      },
      {
        msg: 'refactor(a): a refactoring',
        files: [
          {
            relpath: './packages/a/foo.txt',
            contents: 'foobarbaz'
          }
        ]
      },
      {
        msg: 'feat: init pkg b',
        files: [
          {
            relpath: './packages/b/package.json',
            contents: {
              name: 'b',
              dependencies: {
                a: '1.0.0'
              }
            }
          }
        ]
      },
      {
        msg: 'fix(b): add some file',
        files: [
          {
            relpath: './packages/b/file.txt',
            contents: 'foo bar'
          }
        ]
      }
    ]
  })

  await run({cwd})

  await ctx(async ($) => {
    $.cwd = cwd
    const digestA = JSON.parse((await $`npm view a@1.0.1 --registry=${registry.address} --json`).toString())
    const digestB = JSON.parse((await $`npm view b@1.0.0 --registry=${registry.address} --json`).toString())

    assert.is(digestA['dist-tags'].latest, '1.0.1')
    assert.is(digestA.dist.tarball, 'http://localhost:4873/a/-/a-1.0.1.tgz')

    assert.is(digestB['dist-tags'].latest, '1.0.0')
    assert.is(digestB.dist.tarball, 'http://localhost:4873/b/-/b-1.0.0.tgz')

    const tag = formatTag({name: 'a', version: '1.0.1'})
    assert.is((await $`git for-each-ref refs/tags/${tag} --format='%(contents)'`).toString().trim(), tag)

    const origin = (await $`git remote get-url origin`).toString().trim()
    const meta = tempy.temporaryDirectory()

    await $`git clone --single-branch --branch meta --depth 1 ${origin} ${meta}`
    assert.is((await fs.readJson(`${meta}/${tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')}/package.json`)).version, '1.0.1')
  })

  await registry.stop()
})

test.run()
