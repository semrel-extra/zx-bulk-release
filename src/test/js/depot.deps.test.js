import {describe, test, expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {$, sleep} from 'zx-extra'
import {resolveNextVersion, subsWorkspace, updateDeps, topo, settleQueue} from '../../main/js/post/depot/deps.js'
import {forEachPkg} from '../../main/js/post/depot/steps/contextify.js'

describe('depot.deps', () => {
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
      expect(resolveNextVersion(decl, actual, prev)).toBe(expected)
    })
  })

  test('subsWorkspace replaces workspace: protocol', () => {
    expect(subsWorkspace('workspace:^', '1.2.3')).toBe('^1.2.3')
    expect(subsWorkspace('workspace:~', '1.2.3')).toBe('~1.2.3')
    expect(subsWorkspace('workspace:*', '1.2.3')).toBe('1.2.3')
    expect(subsWorkspace('workspace:^1.0.0', '1.2.3')).toBe('^1.0.0')
    expect(subsWorkspace('^1.0.0', '1.2.3')).toBe('^1.0.0')
  })

  test('resolveNextVersion returns null when no decl', () => {
    expect(resolveNextVersion(null, '1.0.0', '1.0.0')).toBe(null)
    expect(resolveNextVersion(undefined, '1.0.0')).toBe(null)
  })

  test('resolveNextVersion returns actual when not satisfied', () => {
    expect(resolveNextVersion('^1.0.0', '2.0.0', '1.0.0')).toBe('2.0.0')
  })

  test('resolveNextVersion returns null when actual equals prev', () => {
    expect(resolveNextVersion('^1.0.0', '2.0.0', '2.0.0')).toBe(null)
  })

  test('resolveNextVersion returns decl when satisfied and changed', () => {
    expect(resolveNextVersion('^1.0.0', '1.2.0', '^0.9.0')).toBe('^1.0.0')
  })

  test('resolveNextVersion returns null when decl equals prev', () => {
    expect(resolveNextVersion('^1.0.0', '1.2.0', '^1.0.0')).toBe(null)
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
    expect(Array.isArray(changes)).toBeTruthy()
  })

  test('topo returns pkg info and release queue', async () => {
    const {nodes, queue} = await topo({cwd: path.resolve(fixtures, 'regular-monorepo')})
    expect(nodes).toEqual(['a', 'b', 'c', 'd'])
    expect(queue).toEqual(['a', 'b', 'd', 'c'])
  })

  test('topo applies pkg filter', async () => {
    const {queue, graphs, sources} = await topo({cwd: path.resolve(fixtures, 'regular-monorepo'), flags: {ignore: 'b,c'}})
    expect(queue).toEqual(['a', 'd'])
    expect(graphs).toEqual([{ nodes: new Set(['a', 'd']), sources: ['a']}])
    expect(sources).toEqual(['a'])
  })


  // a fails at once; b, running alongside, still finishes; c (after a) and d (after b, done after the failure) never start
  const graph = {queue: ['a', 'b', 'c', 'd'], prev: new Map([['c', ['a']], ['d', ['b']]])}

  test('settleQueue lets running packages finish and starts none after an error', async () => {
    const log = []
    const cb = async (name) => {
      log.push(`+${name}`)
      if (name === 'a') throw new Error('a failed')
      await sleep(20)
      log.push(`-${name}`)
    }

    await expect(settleQueue({...graph, cb})).rejects.toThrow('a failed')
    expect(log).toEqual(['+a', '+b', '-b'])
  })

  test('settleQueue reports all errors together', async () => {
    const cb = async (name) => { if (name === 'a' || name === 'b') throw new Error(`${name} failed`) }
    const error = await settleQueue({...graph, cb}).catch(e => e)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors.map(e => e.message)).toEqual(['a failed', 'b failed'])
  })

  test('forEachPkg runs each package in its own scope, and settles', async () => {
    const packages = Object.fromEntries(graph.queue.map(name => [name, {name, ctx: {}}])) // contextified already
    const seen = []
    const cb = async (pkg) => {
      if (pkg.name === 'a') throw new Error('a failed')
      await sleep(20)
      seen.push(`${pkg.name}:${$.scope}`)
    }

    await expect(forEachPkg({...graph, packages}, cb)).rejects.toThrow('a failed')
    expect(seen).toEqual(['b:b'])
  })
})
