import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'

import {topo} from '@semrel-extra/topo'
import {
  analyzeCommits,
  getNextReleaseType,
  getNextVersion,
  resolvePkgVersion,
  getSemanticChanges,
  semanticRules,
  releaseSeverityOrder,
  analyze,
} from '../../main/js/post/depot/steps/analyze.js'
import {getCommits} from '../../main/js/post/api/git.js'
import {createFakeRepo} from './utils/repo.js'
import {createMock, defaultResponses, makePkg, makeCtx} from './utils/mock.js'

const test = suite('steps.analyze')

const setup = (responses = []) => {
  const mock = createMock([...responses, ...defaultResponses()])
  $.spawn = mock.spawn
  $.quiet = true
  $.verbose = false
  $.memo = new Map()
  $.report = undefined
  return mock
}

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
  ], semanticRules)

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

test('getNextReleaseType returns major for breaking change', () => {
  assert.is(getNextReleaseType([{releaseType: 'patch'}, {releaseType: 'major'}]), 'major')
})

test('getNextReleaseType returns minor for feat', () => {
  assert.is(getNextReleaseType([{releaseType: 'patch'}, {releaseType: 'minor'}]), 'minor')
})

test('getNextReleaseType returns null for empty', () => {
  assert.is(getNextReleaseType([]), null)
})

test('getNextVersion with previous version', () => {
  assert.is(getNextVersion('patch', '1.0.0'), '1.0.1')
  assert.is(getNextVersion('minor', '1.0.0'), '1.1.0')
  assert.is(getNextVersion('major', '1.0.0'), '2.0.0')
})

test('getNextVersion with pre-release suffix', () => {
  assert.is(getNextVersion('patch', '1.0.0', '1.0.0', '-snap.abc1234'), '1.0.1-snap.abc1234')
})

test('getNextVersion without previous version uses default', () => {
  assert.is(getNextVersion('patch', undefined, '0.1.0'), '0.1.0')
  assert.is(getNextVersion('patch', undefined), '1.0.0')
})

test('resolvePkgVersion returns null when no releaseType', () => {
  assert.is(resolvePkgVersion(null, '1.0.0', '0.0.0'), '1.0.0')
  assert.is(resolvePkgVersion(null, undefined, '0.0.0'), null)
})

test('releaseSeverityOrder is major > minor > patch', () => {
  assert.equal(releaseSeverityOrder, ['major', 'minor', 'patch'])
})

test('getSemanticChanges parses commits with rules', async () => {
  await within(async () => {
    const log = '+++fix: bug____abc1__abc1full\n+++feat: new____def1__def1full'
    setup([
      [/git log/, log],
    ])
    const changes = await getSemanticChanges('/tmp/test', 'v1.0.0', undefined, semanticRules)
    assert.is(changes.length, 2)
    assert.is(changes[0].releaseType, 'patch')
    assert.is(changes[1].releaseType, 'minor')
  })
})

test('analyze sets pkg fields', async () => {
  await within(async () => {
    const log = '+++fix: something____abc1__abc1full'
    setup([
      [/git log/, log],
    ])

    const pkg = makePkg({
      version: '1.0.0',
      latest: {tag: {ref: 'v1.0.0', version: '1.0.0', name: 'test-pkg'}, meta: null},
      changes: [],
      extra: {manifest: {name: 'test-pkg', version: '1.0.0'}},
    })
    const ctx = makeCtx({flags: {}})
    pkg.ctx = ctx
    ctx.packages = {[pkg.name]: pkg}

    await analyze(pkg, ctx)

    assert.is(pkg.releaseType, 'patch')
    assert.is(pkg.version, '1.0.1')
    assert.ok(pkg.tag)
    assert.ok(pkg.changes.length > 0)
  })
})

test('analyze with snapshot flag', async () => {
  await within(async () => {
    const log = '+++feat: feature____abc1__abc1full'
    setup([
      [/git log/, log],
    ])

    const pkg = makePkg({
      version: '1.0.0',
      latest: {tag: {ref: 'v1.0.0', version: '1.0.0', name: 'test-pkg'}, meta: null},
      changes: [],
      extra: {manifest: {name: 'test-pkg', version: '1.0.0'}},
    })
    const ctx = makeCtx({flags: {snapshot: true}, git: {sha: 'deadbeef1234567', root: '/tmp/test'}})
    pkg.ctx = ctx
    ctx.packages = {[pkg.name]: pkg}

    await analyze(pkg, ctx)

    assert.ok(pkg.version.includes('-snap.'))
    assert.ok(pkg.preversion)
  })
})

test('analyze with no semantic changes', async () => {
  await within(async () => {
    const log = '+++chore: update deps____abc1__abc1full'
    setup([
      [/git log/, log],
    ])

    const pkg = makePkg({
      version: '1.0.0',
      latest: {tag: {ref: 'v1.0.0', version: '1.0.0', name: 'test-pkg'}, meta: null},
      changes: [],
      extra: {manifest: {name: 'test-pkg', version: '1.0.0'}},
    })
    const ctx = makeCtx({flags: {}})
    pkg.ctx = ctx
    ctx.packages = {[pkg.name]: pkg}

    await analyze(pkg, ctx)

    assert.is(pkg.releaseType, null)
    assert.is(pkg.tag, null)
  })
})

test.run()
