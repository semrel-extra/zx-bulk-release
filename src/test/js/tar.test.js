import {describe, test, expect} from 'vitest'
import {pipeline} from 'node:stream/promises'
import tar from 'tar-stream'
import {fs, path, tempy} from 'zx-extra'
import {unpackTar} from '../../main/js/post/tar.js'

describe('tar', () => {
  const hostile = async (entry) => {
    const file = path.join(tempy.temporaryDirectory(), 'parcel.tar')
    const pack = tar.pack()
    pack.entry({name: 'manifest.json', size: 2}, '{}')
    pack.entry(entry, entry.type === 'symlink' ? undefined : 'x')
    pack.finalize()
    await pipeline(pack, fs.createWriteStream(file))
    return file
  }

  test.each([
    ['a path out of the target', {name: '../escaped.txt', size: 1}],
    // short enough to keep its leading slash: long ones lose it in the ustar prefix and land inside anyway
    ['an absolute path', {name: `/zbr-absolute-${process.pid}.txt`, size: 1}],
    ['a symlink', {name: 'link', type: 'symlink', linkname: '/etc'}],
  ])('unpackTar() rejects %s and writes nothing outside', async (_, entry) => {
    const file = await hostile(entry)
    const dest = path.join(tempy.temporaryDirectory(), 'out')

    await expect(unpackTar(file, dest)).rejects.toThrow(/unsafe entry/)
    expect(fs.existsSync(path.join(dest, '..', 'escaped.txt'))).toBe(false)
    if (path.isAbsolute(entry.name)) expect(fs.existsSync(entry.name)).toBe(false)
  })
})
