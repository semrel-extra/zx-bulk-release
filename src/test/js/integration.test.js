import {suite} from 'uvu'
import * as assert from 'uvu/assert'

import {run} from '../../main/js/index.js'
import {createFakeRepo} from './test-utils.js'

const test = suite('integration')

test('run()', async () => {
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
    ]
  })

  await run({cwd})
})

test.run()
