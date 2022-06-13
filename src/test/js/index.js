import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {fileURLToPath} from "node:url"
import {tempy, path, fs, ctx} from 'zx-extra'

import {getPkgCommits, run, topo} from '../../main/js/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.resolve(__dirname, '../fixtures')

test('index has proper exports', () => {
  assert.instance(run, Function)
})

test('run: dry-run', async () => {
  await run()
})

const createFakeRepo = async ({cwd = tempy.temporaryDirectory(), commits = []} = {}) =>
  ctx(async ($) => {
    $.cwd = cwd
    await $`git init`

    for (let {msg, files, name = 'Semrel-extra Bot', email = 'semrel-extra-bot@hotmail.com', tags = []} of commits) {
      await $`git config user.name ${name}`
      await $`git config user.email ${email}`
      for (let {relpath, contents} of files) {
        const _contents = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
        await fs.outputFile(path.resolve(cwd, relpath), _contents)
      }
      await $`git add .`
      await $`git commit -m ${msg}`

      for (let tag of tags) {
        await $`git tag ${tag} -m ${tag}`
      }
    }

    return cwd
  })

test('obtains commits for each package', async () => {
  const cwd = await createFakeRepo({commits: [
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
        tags: ['v1.0.0+pkg-a']
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
                a: '*'
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
  ]})

  const {queue, packages} = await topo({cwd})
  const results = {}
  for (let pkg of queue) {
    results[pkg] = (await getPkgCommits(packages[pkg].absPath, 'v1.0.0+pkg-a'))
      .map(({subj}) => subj)
  }

  assert.equal(results, {
    a: ['refactor(a): a refactoring'],
    b: ['fix(b): add some file', 'feat: init pkg b']
  })
})

test.run()
