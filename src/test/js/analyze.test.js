import {suite} from 'uvu'
import * as assert from 'uvu/assert'

import {topo} from '@semrel-extra/topo'
import {analyzeCommits, getNextVersion, resolvePkgVersion} from '../../main/js/analyze.js'
import {getCommits} from '../../main/js/git.js'
import {createFakeRepo} from './test-utils.js'

const test = suite('analyze')

test('`getCommits` obtains commits for each package', async () => {
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
    },
    {
      msg: `patch(a,b): patch both a and b

commit details
      
`,
      files: [
        {
          relpath: './packages/b/file2.txt',
          contents: 'foo bar qux'
        },
        {
          relpath: './packages/a/file2.txt',
          contents: 'foo bar qux'
        }
      ]
    }
  ]})
  const {queue, packages} = await topo({cwd})
  const results = {}
  for (let pkg of queue) {
    results[pkg] = (await getCommits(packages[pkg].absPath, '2022.6.13-a.v1.0.0-f0'))
      .map(({subj}) => subj)
  }

  assert.equal(results, {
    a: [
      'patch(a,b): patch both a and b',
      'refactor(a): a refactoring',
    ],
    b: [
      'patch(a,b): patch both a and b',
      'fix(b): add some file',
      'feat: init pkg b'
    ]
  })
})

test('`analyzeCommits` analyzes commits for each package', async () => {
  const result = analyzeCommits([
    {
      subj: 'patch(a,b): patch both a and b',
      body: '',
      short: 'fdc0fe9',
      hash: 'fdc0fe9ac8ee1d2f35381302395ff8e0d497deb2'
    },
    {
      subj: 'fix(b): add some file',
      body: '',
      short: 'be70e04',
      hash: 'be70e0497004f0bd95afd8dd76c2fd71ebadc08b'
    },
    {
      subj: 'feat: init pkg b',
      body: '',
      short: '1b693b9',
      hash: '1b693b9912b0076f5f29d57db1f3026ef24eedd8'
    },
    {
      subj: 'chore: update deps',
      body: `chore: update deps

  BREAKING CHANGE: following the deps, now it's pure ESM

    `,
      short: 'e296ecd',
      hash: 'e296ecddfcb70a4fd44c8372461e3a1447655c2e'
    }
  ])

  assert.equal(result, [
    {
      group: 'Fixes & improvements',
      releaseType: 'patch',
      change: 'patch(a,b): patch both a and b',
      subj: 'patch(a,b): patch both a and b',
      body: '',
      short: 'fdc0fe9',
      hash: 'fdc0fe9ac8ee1d2f35381302395ff8e0d497deb2'
    },
    {
      group: 'Fixes & improvements',
      releaseType: 'patch',
      change: 'fix(b): add some file',
      subj: 'fix(b): add some file',
      body: '',
      short: 'be70e04',
      hash: 'be70e0497004f0bd95afd8dd76c2fd71ebadc08b'
    },
    {
      group: 'Features',
      releaseType: 'minor',
      change: 'feat: init pkg b',
      subj: 'feat: init pkg b',
      body: '',
      short: '1b693b9',
      hash: '1b693b9912b0076f5f29d57db1f3026ef24eedd8'
    },
    {
      group: 'BREAKING CHANGES',
      releaseType: 'major',
      change: "following the deps, now it's pure ESM",
      subj: 'chore: update deps',
      body: `chore: update deps

  BREAKING CHANGE: following the deps, now it's pure ESM

    `,
      short: 'e296ecd',
      hash: 'e296ecddfcb70a4fd44c8372461e3a1447655c2e'
    }
  ])
})

test('resolvePkgVersion()', async () => {
  const cases = [
    ['minor', '1.0.0', '0.0.0', '1.1.0'],
    ['patch', '1.0.0', '0.0.0', '1.0.1'],
    ['major', undefined, '0.0.0', '0.0.0'],
    ['minor', undefined, undefined, '1.0.0'],
  ]

  cases.forEach(([releaseType, prev, def, expected]) => {
    assert.is(resolvePkgVersion(releaseType, prev, def), expected)
  })
})

test.run()
