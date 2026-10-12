import {describe, test, expect} from 'vitest'
import {$, fs, path, tempy} from 'zx-extra'
import {channels, deliver} from '../../main/js/post/courier/index.js'
import {api} from '../../main/js/post/api/index.js'
import {packTar, readMarker} from '../../main/js/post/tar.js'
import {sanitizePkgName} from '../../main/js/post/parcel/build.js'
import {createFakeRepo} from './utils/repo.js'

// Real claims and semaphore against a local origin; npm and meta (for announce) are recorded.
describe('courier.execute', () => {
  const env = {...process.env, NPM_TOKEN: 'tok', NPM_REGISTRY: 'https://registry.example'}

  // Master has moved past the release commit; deliver runs from a fresh repo, as without a checkout.
  const setup = async () => {
    const work = await createFakeRepo({commits: ['release', 'next'].map(m => ({msg: `fix: ${m}`, files: [{relpath: `${m}.txt`, contents: m}]}))})
    await $({cwd: work})`git push origin HEAD:master`
    const [next, sha] = (await $({cwd: work})`git rev-list HEAD`).toString().split('\n')
    const origin = (await $({cwd: work})`git remote get-url origin`).toString()
    const fresh = () => api.git.openRepo(tempy.temporaryDirectory(), origin)
    return {work, origin, sha, next, fresh, cwd: await fresh(), dir: tempy.temporaryDirectory()}
  }

  // A claim, a publish and an announce parcel per package, and the directive over them.
  const pack = async ({dir, sha}, pkgs, {directive = true} = {}) => {
    const sha7 = sha.slice(0, 7)
    const packages = {}
    for (const {name, version = '1.0.0'} of pkgs) {
      const tag = `${name}@${version}`
      const parcels = []
      for (const [channel, extra] of [['git-tag', {tag, sha}], ['npm', {registry: '${{NPM_REGISTRY}}', token: '${{NPM_TOKEN}}'}], ['meta', {tag, originUrl: 'unused'}]]) {
        const file = `parcel.${sha7}.${channel}.${sanitizePkgName(name)}.${version}.abcdef.tar`
        await packTar(path.join(dir, file), {channel, name, version, ...extra}, [])
        parcels.push(file)
      }
      packages[name] = {version, tag, parcels}
    }
    if (directive) await packTar(path.join(dir, `parcel.${sha7}.directive.1700000000.tar`), {
      channel: 'directive', sha, timestamp: 1700000000,
      queue: pkgs.map(p => p.name),
      packages,
      parcels: Object.values(packages).flatMap(p => p.parcels),
      prev: Object.fromEntries(pkgs.filter(p => p.deps).map(p => [p.name, p.deps])),
    }, [])
    return {tars: (await fs.readdir(dir)).map(f => path.join(dir, f)), packages}
  }

  // Swaps channel runs for the call; each replacement gets the original run.
  const withRuns = async (runs, fn) => {
    const orig = Object.fromEntries(Object.keys(runs).map(n => [n, channels[n].run]))
    for (const [n, wrap] of Object.entries(runs)) channels[n].run = wrap(orig[n])
    try { return await fn() } finally { for (const n in orig) channels[n].run = orig[n] }
  }
  const recorder = (log, behave = {}) => ({
    'git-tag': (claim) => async (m, d, c) => { log.push(`claim ${m.tag}`); return claim(m, d, c) },
    npm:  () => async (m) => { log.push(`npm ${m.name}@${m.version}`); return behave.npm ? behave.npm(m) : 'ok' },
    meta: () => async (m) => { log.push(`meta ${m.name}@${m.version}`); return 'ok' },
  })

  const markers = async (dir, files) => Promise.all(files.map(f => readMarker(path.join(dir, f))))
  const hook = (origin, name, script) => fs.outputFile(path.join(origin, 'hooks', name), `#!/bin/sh\n${script}\n`, {mode: 0o755})
  const lockOf = (sha) => `zbr-deliver.${sha.slice(0, 7)}`
  const directiveOf = (dir, sha) => path.join(dir, `parcel.${sha.slice(0, 7)}.directive.1700000000.tar`)

  test('a rejected claim holds its package and the rest is delivered; a re-run completes it', async () => {
    const ctx = await setup()
    const {tars, packages} = await pack(ctx, [{name: 'a'}, {name: 'b'}])
    await hook(ctx.origin, 'pre-receive', 'while read old new ref; do [ "$ref" = "refs/tags/a@1.0.0" ] && { echo "a is protected" >&2; exit 1; }; done; exit 0')

    const log = []
    await expect(withRuns(recorder(log), () => deliver(tars, env, {cwd: ctx.cwd}))).rejects.toThrow(/a is protected/)
    expect(log.filter(l => l.includes(' a@'))).toEqual(['claim a@1.0.0'])
    expect(log).toEqual(expect.arrayContaining(['claim b@1.0.0', 'npm b@1.0.0', 'meta b@1.0.0']))
    expect(await api.git.getRemoteTagCommit(ctx.cwd, 'b@1.0.0')).toBe(ctx.sha)
    expect(await api.git.getRemoteTagCommit(ctx.cwd, lockOf(ctx.sha))).toBe(null)
    expect(await markers(ctx.dir, packages.a.parcels)).toEqual([null, null, null])
    expect(await markers(ctx.dir, packages.b.parcels)).toEqual(['released', 'released', 'released'])
    expect(await readMarker(directiveOf(ctx.dir, ctx.sha))).toBe(null)

    await fs.remove(path.join(ctx.origin, 'hooks/pre-receive'))
    const rerun = []
    const cwd = await ctx.fresh()
    await withRuns(recorder(rerun), () => deliver(tars, env, {cwd}))
    expect(rerun).toEqual(['claim a@1.0.0', 'npm a@1.0.0', 'meta a@1.0.0'])
    expect(await readMarker(directiveOf(ctx.dir, ctx.sha))).toBe('released')
  })

  test('everything in flight settles before the lock goes; packages not yet started are held', async () => {
    const ctx = await setup()
    const {tars} = await pack(ctx, [{name: 'a'}, {name: 'b'}, {name: 'c', deps: ['b']}])

    const log = []
    let failed
    const aFailed = new Promise(resolve => { failed = resolve })
    const npm = async ({name}) => {
      if (name === 'a') {
        setTimeout(failed) // b goes on once a's failure is recorded
        throw new Error('registry is down for a')
      }
      await aFailed
      log.push(`locked while ${name} publishes: ${await api.git.getRemoteTagCommit(ctx.cwd, lockOf(ctx.sha)) === ctx.sha}`)
      return 'ok'
    }
    await expect(withRuns(recorder(log, {npm}), () => deliver(tars, env, {cwd: ctx.cwd}))).rejects.toThrow(/registry is down for a/)

    expect(log).toContain('locked while b publishes: true')
    expect(log).toContain('meta b@1.0.0')
    expect(log.some(l => l.includes(' c@'))).toBe(false)
    expect(log).not.toContain('meta a@1.0.0')
    expect(await api.git.getRemoteTagCommit(ctx.cwd, lockOf(ctx.sha))).toBe(null)
  })

  test('a lost claim sends its package and the dependents to the rebuild', async () => {
    const ctx = await setup()
    const {tars, packages} = await pack(ctx, [{name: 'a'}, {name: 'b', deps: ['a']}, {name: 'c', deps: ['b']}, {name: 'd'}])
    await $({cwd: ctx.work})`git tag a@1.0.0 ${ctx.next}`
    await $({cwd: ctx.work})`git push origin a@1.0.0`

    const log = []
    const result = await withRuns(recorder(log), () => deliver(tars, env, {cwd: ctx.cwd}))

    expect(result.conflicts.sort()).toEqual(['a', 'b', 'c'])
    expect(log.filter(l => /[bc]@/.test(l))).toEqual([])
    expect(log).toEqual(expect.arrayContaining(['claim d@1.0.0', 'npm d@1.0.0', 'meta d@1.0.0']))
    for (const name of ['a', 'b', 'c']) expect(await markers(ctx.dir, packages[name].parcels)).toEqual(['conflict', 'conflict', 'conflict'])
    expect(await api.git.getRemoteTagCommit(ctx.cwd, 'b@1.0.0')).toBe(null)
    expect(await api.git.getRemoteTagCommit(ctx.cwd, `zbr-rebuild.${ctx.sha.slice(0, 7)}`)).toBe(ctx.sha)
    expect(await readMarker(directiveOf(ctx.dir, ctx.sha))).toBe('conflict')
  })

  test('held parcels wait for an env that can deliver them; a held claim holds its package', async () => {
    const ctx = await setup()
    const {tars, packages} = await pack(ctx, [{name: 'a'}, {name: 'b'}])
    await fs.remove(path.join(ctx.dir, packages.b.parcels[0]))
    const present = tars.filter(t => fs.existsSync(t))

    const log = []
    const warnings = []
    $.report = {log() {}, warn: (...args) => warnings.push(args.join(' '))}
    const result = await withRuns(recorder(log), () => deliver(present, {...env, NPM_TOKEN: ''}, {cwd: ctx.cwd}))
    $.report = undefined
    expect(log.sort()).toEqual(['claim a@1.0.0', 'meta a@1.0.0'])
    expect(result.skipped).toBe(4) // a's npm and b's npm lack credentials, b's claim is missing, so b's meta waits
    expect(warnings).toContain('holding b: its claim is not released')
    expect(await markers(ctx.dir, packages.a.parcels)).toEqual(['released', null, 'released'])
    expect(await readMarker(directiveOf(ctx.dir, ctx.sha))).toBe(null)

    const rerun = []
    await withRuns(recorder(rerun), () => deliver(present, env, {cwd: ctx.cwd}))
    expect(rerun).toEqual(['npm a@1.0.0'])
    expect(await readMarker(directiveOf(ctx.dir, ctx.sha))).toBe(null) // b still waits for its claim
  })

  test('a dry run touches no remote and no parcel', async () => {
    const ctx = await setup()
    const {tars} = await pack(ctx, [{name: 'a'}, {name: 'b'}])
    const updates = path.join(tempy.temporaryDirectory(), 'updates.log')
    await hook(ctx.origin, 'update', `echo "$1" >> ${updates}`)
    const before = await Promise.all(tars.map(t => fs.readFile(t)))

    const log = []
    const result = await withRuns(recorder(log), () => deliver(tars, env, {cwd: ctx.cwd, dryRun: true}))

    expect(log).toEqual([])
    expect(fs.existsSync(updates)).toBe(false)
    expect(await Promise.all(tars.map(t => fs.readFile(t)))).toEqual(before)
    expect(result).toMatchObject({delivered: 0, pending: 6})
    expect(result.entries).toHaveLength(6)
  })

  test('a re-run of fresh copies of the same parcels ends in duplicates, not conflicts', async () => {
    const ctx = await setup()
    const {tars} = await pack(ctx, [{name: 'a'}])
    const copies = tempy.temporaryDirectory()
    await fs.copy(ctx.dir, copies)

    const registry = new Set()
    const origNpm = api.npm
    api.npm = {...origNpm,
      npmPublish: async ({name, version}) => {
        if (registry.has(`${name}@${version}`)) throw new Error('E403 403 Forbidden - cannot publish over')
        registry.add(`${name}@${version}`)
      },
      npmPublished: async ({name, version}) => registry.has(`${name}@${version}`),
    }
    try {
      await withRuns({meta: () => async () => 'ok'}, () => deliver(tars, env, {cwd: ctx.cwd}))
      const again = (await fs.readdir(copies)).map(f => path.join(copies, f))
      const cwd = await ctx.fresh()
      const result = await withRuns({meta: () => async () => 'ok'}, () => deliver(again, env, {cwd}))

      expect(result.conflicts).toEqual([])
      expect(await Promise.all(again.map(readMarker))).toEqual(again.map(() => 'released'))
    } finally {
      api.npm = origNpm
    }
  })

  test('without a directive versions of a package go in order, other packages alongside', async () => {
    const ctx = await setup()
    const {tars} = await pack(ctx, [{name: 'a', version: '1.0.1'}, {name: 'a', version: '1.0.0'}, {name: 'b'}], {directive: false})

    const log = []
    const result = await withRuns(recorder(log), () => deliver(tars, env, {cwd: ctx.cwd}))

    expect(result.delivered).toBe(9)
    expect(log.indexOf('meta a@1.0.0')).toBeLessThan(log.indexOf('claim a@1.0.1'))
    expect(log.indexOf('claim b@1.0.0')).toBeLessThan(log.indexOf('claim a@1.0.1'))
  })

  test('without a directive a lost claim fails the run, later versions are releases of their own', async () => {
    const ctx = await setup()
    const {tars, packages} = await pack(ctx, [{name: 'a', version: '1.0.0'}, {name: 'a', version: '1.0.1'}, {name: 'b'}], {directive: false})
    await $({cwd: ctx.work})`git tag a@1.0.0 ${ctx.next}`
    await $({cwd: ctx.work})`git push origin a@1.0.0`

    const log = []
    await expect(withRuns(recorder(log), () => deliver(tars, env, {cwd: ctx.cwd}))).rejects.toThrow(/^a@1\.0\.0: the release tag belongs to another commit$/)
    expect(log.filter(l => l.includes('a@1.0.0'))).toEqual(['claim a@1.0.0'])
    expect(log).toEqual(expect.arrayContaining(['claim a@1.0.1', 'npm a@1.0.1', 'claim b@1.0.0', 'npm b@1.0.0']))
    expect(await markers(ctx.dir, packages.a.parcels)).toEqual(['released', 'released', 'released']) // 1.0.1
  })

  test('a broken claim holds its package; a marker on a claim counts for what the remote says', async () => {
    const ctx = await setup()
    const {tars, packages} = await pack(ctx, [{name: 'a'}, {name: 'b'}, {name: 'c'}, {name: 'd'}, {name: 'e'}])
    await fs.writeFile(path.join(ctx.dir, packages.a.parcels[0]), 'not a tar at all, rather long')
    for (const name of ['b', 'c', 'd']) await fs.writeFile(path.join(ctx.dir, packages[name].parcels[0]), name === 'b' ? 'released' : 'conflict')
    await $({cwd: ctx.work})`git tag c@1.0.0 ${ctx.next}` // c lost its claim for real; b's and d's markers lie
    await $({cwd: ctx.work})`git push origin c@1.0.0`

    const log = []
    const result = await withRuns(recorder(log), () => deliver(tars, env, {cwd: ctx.cwd}))

    expect(log.sort()).toEqual(['claim e@1.0.0', 'meta e@1.0.0', 'npm e@1.0.0'])
    expect(result.invalid.map(i => i.file).sort()).toEqual([packages.a.parcels[0], packages.b.parcels[0], packages.d.parcels[0]].sort())
    expect(result.conflicts).toEqual(['c'])
    expect(await markers(ctx.dir, packages.c.parcels)).toEqual(['conflict', 'conflict', 'conflict'])
    expect(await markers(ctx.dir, packages.d.parcels)).toEqual(['conflict', null, null]) // no rebuild loop for a lie
    expect(await api.git.getRemoteTagCommit(ctx.cwd, `zbr-rebuild.${ctx.sha.slice(0, 7)}`)).toBe(ctx.sha)
  })

  test('the order follows the dependencies, wherever the directive puts a package', async () => {
    const ctx = await setup()
    const {tars} = await pack(ctx, [{name: 'b', deps: ['a']}, {name: 'a'}]) // b listed before what it waits on
    await $({cwd: ctx.work})`git tag a@1.0.0 ${ctx.next}`
    await $({cwd: ctx.work})`git push origin a@1.0.0`

    const log = []
    const result = await withRuns(recorder(log), () => deliver(tars, env, {cwd: ctx.cwd}))
    expect(result.conflicts.sort()).toEqual(['a', 'b'])
    expect(log).toEqual(['claim a@1.0.0'])
  })

  test('parcels of a directive marked done or lost never go out loose', async () => {
    const ctx = await setup()
    const {tars, packages} = await pack(ctx, [{name: 'a'}])
    await fs.writeFile(directiveOf(ctx.dir, ctx.sha), 'released')

    const log = []
    const result = await withRuns(recorder(log), () => deliver(tars, env, {cwd: ctx.cwd}))
    expect(log).toEqual([])
    expect(result.delivered).toBe(0)
    expect(await markers(ctx.dir, packages.a.parcels)).toEqual([null, null, null])
  })

  test('a failed rebuild signal adds to the errors, it does not replace them', async () => {
    const ctx = await setup()
    const {tars} = await pack(ctx, [{name: 'a'}, {name: 'b'}])
    await $({cwd: ctx.work})`git tag a@1.0.0 ${ctx.next}`
    await $({cwd: ctx.work})`git push origin a@1.0.0`
    await hook(ctx.origin, 'pre-receive', 'while read old new ref; do case "$ref" in refs/tags/zbr-rebuild.*) echo "rebuilds are off" >&2; exit 1;; esac; done; exit 0')

    const npm = async ({name}) => { if (name === 'b') throw new Error('registry is down for b'); return 'ok' }
    const error = await withRuns(recorder([], {npm}), () => deliver(tars, env, {cwd: ctx.cwd})).catch(e => e)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors.map(e => e.message).join('\n')).toMatch(/registry is down for b[\s\S]*rebuilds are off/)
    expect(await readMarker(directiveOf(ctx.dir, ctx.sha))).toBe(null)
  })

  test('a dry run shows what the rules would hold', async () => {
    const ctx = await setup()
    const {tars, packages} = await pack(ctx, [{name: 'a'}, {name: 'b'}])
    await fs.remove(path.join(ctx.dir, packages.a.parcels[0]))

    const result = await deliver(tars.filter(t => fs.existsSync(t)), env, {cwd: ctx.cwd, dryRun: true})
    expect(result.entries.map(e => `${e.channel} ${e.name}`).sort()).toEqual(['git-tag b', 'meta b', 'npm b'])
    expect(result.skipped).toBe(3)
  })

  test('without a directive an unreadable parcel stops everything: it can not be told to which claim it belongs', async () => {
    const ctx = await setup()
    const {tars, packages} = await pack(ctx, [{name: 'a'}], {directive: false})
    await fs.writeFile(path.join(ctx.dir, packages.a.parcels[1]), 'not a tar at all, rather long')

    const log = []
    await expect(withRuns(recorder(log), () => deliver(tars, env, {cwd: ctx.cwd}))).rejects.toThrow(/parcels of no package/)
    expect(log).toEqual([])
  })
})
