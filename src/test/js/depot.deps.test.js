import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {resolveNextVersion, subsWorkspace, updateDeps, topo} from '../../main/js/post/depot/deps.js'

const test = suite('depot.deps')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.resolve(__dirname, '../fixtures')

test('resolveNextVersion()', async () => {
  const cases = [
    [,,,null],
    ['^1.0', '2.0.0',, '2.0.0'],
    ['^1.0', '2.0.0', '2.0.0', null],
    ['^1.0', '2.0.0', '1.2.3', '2.0.0'],

    ['^1.0', '1.0.0',, '^1.0'],
    ['^1.0', '1.1.1',, '^1.0'],
    ['^1.0', '1.1.1', '^1.0', null],
    ['^1.0', '1.1.1', '^1.0.0', '^1.0'],

    ['workspace:^', '1.0.0',, '^1.0.0'],
    ['workspace:~', '1.0.0',, '~1.0.0'],
    ['workspace:*', '1.0.0',, '1.0.0'],
    ['workspace:*', '1.0.0', '1.0.0', null],
    ['workspace:^1.0', '1.1.1', '^1.0', null],
    ['workspace:1.0.0', '1.0.0',, '1.0.0'],
    ['workspace:^1.0', '2.0.0',, '2.0.0'],
  ]

  cases.forEach(([decl, actual, prev, expected]) => {
    assert.is(resolveNextVersion(decl, actual, prev), expected)
  })
})

test('subsWorkspace replaces workspace: protocol', () => {
  assert.is(subsWorkspace('workspace:^', '1.2.3'), '^1.2.3')
  assert.is(subsWorkspace('workspace:~', '1.2.3'), '~1.2.3')
  assert.is(subsWorkspace('workspace:*', '1.2.3'), '1.2.3')
  assert.is(subsWorkspace('workspace:^1.0.0', '1.2.3'), '^1.0.0')
  assert.is(subsWorkspace('^1.0.0', '1.2.3'), '^1.0.0')
})

test('resolveNextVersion returns null when no decl', () => {
  assert.is(resolveNextVersion(null, '1.0.0', '1.0.0'), null)
  assert.is(resolveNextVersion(undefined, '1.0.0'), null)
})

test('resolveNextVersion returns actual when not satisfied', () => {
  assert.is(resolveNextVersion('^1.0.0', '2.0.0', '1.0.0'), '2.0.0')
})

test('resolveNextVersion returns null when actual equals prev', () => {
  assert.is(resolveNextVersion('^1.0.0', '2.0.0', '2.0.0'), null)
})

test('resolveNextVersion returns decl when satisfied and changed', () => {
  assert.is(resolveNextVersion('^1.0.0', '1.2.0', '^0.9.0'), '^1.0.0')
})

test('resolveNextVersion returns null when decl equals prev', () => {
  assert.is(resolveNextVersion('^1.0.0', '1.2.0', '^1.0.0'), null)
})

test('updateDeps walks dependencies and collects changes', async () => {
  const depPkg = {name: 'dep', version: '2.0.0', absPath: '/dep'}
  const pkg = {
    name: 'main',
    absPath: '/main',
    latest: {meta: {dependencies: {dep: '^1.0.0'}}},
    manifest: {dependencies: {dep: 'workspace:^'}},
    ctx: {
      packages: {
        main: {},
        dep: depPkg,
      },
    },
  }
  pkg.ctx.packages.main = pkg

  const changes = await updateDeps(pkg)
  assert.ok(Array.isArray(changes))
})

test('topo returns pkg info and release queue', async () => {
  const {nodes, queue} = await topo({cwd: path.resolve(fixtures, 'regular-monorepo')})
  assert.equal(nodes, ['a', 'b', 'c', 'd'])
  assert.equal(queue, ['a', 'b', 'd', 'c'])
})

test('topo applies pkg filter', async () => {
  const {queue, graphs, sources} = await topo({cwd: path.resolve(fixtures, 'regular-monorepo'), flags: {ignore: 'b,c'}})
  assert.equal(queue, ['a', 'd'])
  assert.equal(graphs, [{ nodes: new Set(['a', 'd']), sources: ['a']}])
  assert.equal(sources, ['a'])
})

test.run()
