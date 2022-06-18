import {suite} from 'uvu'
import * as assert from 'uvu/assert'

import { topo } from '@semrel-extra/topo'
import {getPkgCommits} from '../../main/js/analyze.js'
import {createFakeRepo} from './test-utils.js'

const test = suite('analyze')

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
  ]})
  const {queue, packages} = await topo({cwd})
  const results = {}
  for (let pkg of queue) {
    results[pkg] = (await getPkgCommits(packages[pkg].absPath, '2022.6.13-a.v1.0.0-f0'))
      .map(({subj}) => subj)
  }

  assert.equal(results, {
    a: ['refactor(a): a refactoring'],
    b: ['fix(b): add some file', 'feat: init pkg b']
  })
})

test.run()
