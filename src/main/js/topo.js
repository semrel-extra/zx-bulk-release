import {topo as _topo} from '@semrel-extra/topo'

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