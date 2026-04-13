import {describe, test, expect} from 'vitest'
import {fs, path, tempy} from 'zx-extra'
import {packTar} from '../../main/js/post/tar.js'
import {
  parcelChannel,
  buildDirective,
  parseDirective,
  scanDirectives,
  invalidateOrphans,
} from '../../main/js/post/parcel/index.js'

describe('parcel.directive', () => {
  // --- parcelChannel ---

  test('parcelChannel extracts channel from parcel filename', () => {
    expect(parcelChannel('parcel.abc1234.npm.pkg.1.0.0.aaa111.tar')).toBe('npm')
    expect(parcelChannel('parcel.abc1234.git-tag.pkg.1.0.0.bbb222.tar')).toBe('git-tag')
    expect(parcelChannel('parcel.abc1234.gh-release.pkg.1.0.0.ccc333.tar')).toBe('gh-release')
    expect(parcelChannel('parcel.abc1234.directive.1700000000.tar')).toBe('directive')
  })

  // --- buildDirective + parseDirective ---

  test('buildDirective creates a tar, parseDirective reads it back', async () => {
    const dir = tempy.temporaryDirectory()
    const sha = 'abc1234567890abcdef'
    const timestamp = '1700000000'

    const packedPkgs = [
      {
        name: 'pkg-a',
        version: '1.0.0',
        tag: '2026.4.12-pkg-a.1.0.0-f0',
        tars: [path.join(dir, 'parcel.abc1234.npm.pkg-a.1.0.0.aaa.tar')],
        activeTransport: ['npm', 'git-tag'],
        ctx: {git: {sha, timestamp}},
      },
    ]

    const tarPath = await buildDirective({}, packedPkgs, dir)
    expect(tarPath.endsWith('.tar')).toBeTruthy()
    expect(path.basename(tarPath).startsWith('parcel.abc1234.directive.')).toBeTruthy()

    const manifest = await parseDirective(tarPath)
    expect(manifest.channel).toBe('directive')
    expect(manifest.sha).toBe(sha)
    expect(manifest.timestamp).toBe(Number(timestamp))
    expect(manifest.queue).toEqual(['pkg-a'])
    expect(manifest.packages['pkg-a'].version).toBe('1.0.0')
    expect(manifest.packages['pkg-a'].deliver.length > 0).toBeTruthy()
  })

  test('buildDirective splits git and non-git channels into separate deliver steps', async () => {
    const dir = tempy.temporaryDirectory()
    const sha = 'abc1234567890abcdef'

    const packedPkgs = [{
      name: 'pkg',
      version: '1.0.0',
      tag: 'tag',
      tars: [],
      activeTransport: ['git-tag', 'meta', 'npm', 'gh-release'],
      ctx: {git: {sha, timestamp: '100'}},
    }]

    const tarPath = await buildDirective({}, packedPkgs, dir)
    const manifest = await parseDirective(tarPath)

    const steps = manifest.packages.pkg.deliver
    // git channels in one step, non-git in another
    expect(steps.length).toBe(2)
    expect(steps[0].includes('git-tag')).toBeTruthy()
    expect(steps[0].includes('meta')).toBeTruthy()
    expect(steps[0].includes('gh-release')).toBeTruthy()
    expect(steps[1].includes('npm')).toBeTruthy()
  })

  test('parseDirective returns null for released marker', async () => {
    const tarPath = path.join(tempy.temporaryDirectory(), 'parcel.abc1234.directive.100.tar')
    await fs.writeFile(tarPath, 'released')
    expect(await parseDirective(tarPath)).toBe(null)
  })

  test('parseDirective returns null for conflict marker', async () => {
    const tarPath = path.join(tempy.temporaryDirectory(), 'parcel.abc1234.directive.100.tar')
    await fs.writeFile(tarPath, 'conflict')
    expect(await parseDirective(tarPath)).toBe(null)
  })

  // --- scanDirectives ---

  test('scanDirectives finds and sorts directives by timestamp', async () => {
    const dir = tempy.temporaryDirectory()
    const sha = 'abc1234567890abcdef'

    const mkDirective = async (ts) => {
      const packedPkgs = [{
        name: 'pkg',
        version: '1.0.0',
        tag: 'tag',
        tars: [],
        activeTransport: ['npm'],
        ctx: {git: {sha, timestamp: String(ts)}},
      }]
      return buildDirective({}, packedPkgs, dir)
    }

    await mkDirective(300)
    await mkDirective(100)
    await mkDirective(200)

    const directives = await scanDirectives(dir)
    expect(directives.length).toBe(3)
    expect(directives[0].timestamp).toBe(100)
    expect(directives[1].timestamp).toBe(200)
    expect(directives[2].timestamp).toBe(300)
  })

  test('scanDirectives skips released directives', async () => {
    const dir = tempy.temporaryDirectory()
    const sha = 'abc1234567890abcdef'

    const packedPkgs = [{
      name: 'pkg', version: '1.0.0', tag: 'tag', tars: [],
      activeTransport: ['npm'],
      ctx: {git: {sha, timestamp: '100'}},
    }]

    const tarPath = await buildDirective({}, packedPkgs, dir)
    await fs.writeFile(tarPath, 'released')

    const directives = await scanDirectives(dir)
    expect(directives.length).toBe(0)
  })

  // --- invalidateOrphans ---

  test('invalidateOrphans marks unowned parcels as orphan', async () => {
    const dir = tempy.temporaryDirectory()
    const sha7 = 'abc1234'

    const owned = `parcel.${sha7}.npm.pkg.1.0.0.aaa.tar`
    const orphan = `parcel.${sha7}.gh-release.pkg.1.0.0.bbb.tar`
    const directive = `parcel.${sha7}.directive.100.tar`

    await fs.writeFile(path.join(dir, owned), 'data')
    await fs.writeFile(path.join(dir, orphan), 'data')
    await fs.writeFile(path.join(dir, directive), 'data')

    await invalidateOrphans(dir, {
      sha: sha7 + '567890abcdef',
      parcels: [owned],
    })

    expect(await fs.readFile(path.join(dir, owned), 'utf8')).toBe('data')
    expect(await fs.readFile(path.join(dir, orphan), 'utf8')).toBe('orphan')
    expect(await fs.readFile(path.join(dir, directive), 'utf8')).toBe('data') // directives untouched
  })

  test('invalidateOrphans is a no-op when all parcels are owned', async () => {
    const dir = tempy.temporaryDirectory()
    const sha7 = 'abc1234'

    const p1 = `parcel.${sha7}.npm.pkg.1.0.0.aaa.tar`
    await fs.writeFile(path.join(dir, p1), 'data')

    await invalidateOrphans(dir, {
      sha: sha7 + '567890abcdef',
      parcels: [p1],
    })

    expect(await fs.readFile(path.join(dir, p1), 'utf8')).toBe('data')
  })

})
