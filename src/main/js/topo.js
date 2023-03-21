import {topo as _topo} from '@semrel-extra/topo'
import {getPromise} from './util.js'

export const topo = async ({flags = {}, cwd} = {}) => {
  const ignore = typeof flags.ignore === 'string'
    ? flags.ignore.split(/\s*,\s*/)
    : Array.isArray(flags.ignore)
      ? flags.ignore
      : []

  const filter = flags.includePrivate
    ? () => true
    : ({manifest: {private: _private, name}}) =>
      flags.includePrivate ? true : !_private &&
      !ignore.includes(name)

  return _topo({cwd, filter})
}

export const traverse = async ({nodes, prev, cb}) => {
  const waitings = nodes.reduce((acc, node) => {
    acc[node] = getPromise()
    return acc
  }, {})

  await Promise.all(nodes.map(async (name) => {
    await Promise.all((prev.get(name) || []).map((p) => waitings[p].promise))
    await cb(name)
    waitings[name].resolve(true)
  }))
}
