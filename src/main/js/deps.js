import {semver} from 'zx-extra'
import {topo as _topo, traverseDeps} from '@semrel-extra/topo'

export {traverseQueue, traverseDeps} from '@semrel-extra/topo'

export const updateDeps = async (pkg, packages) => {
  const changes = []

  await traverseDeps({pkg, packages, cb: async ({name, version, deps, scope, pkg: dep}) => {
    const prev = pkg.latest.meta?.[scope]?.[name]
    const actual = dep?.version
    const next = resolveNextVersion(version, actual, prev)
    const _version = next || subsWorkspace(version, actual)

    pkg[scope] = {...pkg[scope], [name]: _version}  // Update pkg context
    deps[name] = _version                           // Update manifest

    if (!next) return
    changes.push({
      group: 'Dependencies',
      releaseType: 'patch',
      change: 'perf',
      subj: `perf: ${name} updated to ${next}`,
    })
  }})

  return changes
}

export const resolveNextVersion = (decl, actual, prev) => {
  if (!decl) return null

  // https://yarnpkg.com/features/workspaces
  decl = subsWorkspace(decl, actual)

  if (!semver.satisfies(actual, decl)) return actual === prev ? null : actual

  return decl === prev ? null : decl
}

export const subsWorkspace = (decl, actual) => {
  if (decl.startsWith('workspace:')) {
    const [, range, caret] = /^workspace:(([\^~*])?.*)$/.exec(decl)

    return caret === range
      ? caret === '*' ? actual : caret + actual
      : range
  }

  return decl
}

export const topo = async ({flags = {}, cwd} = {}) => {
  const ignore = typeof flags.ignore === 'string'
    ? flags.ignore.split(/\s*,\s*/)
    : Array.isArray(flags.ignore)
      ? flags.ignore
      : []

  const depFilter = flags.onlyWorkspaceDeps ? ({version}) => version.startsWith('workspace:') : undefined
  const pkgFilter = ({manifest: {private: _private, name}}) =>
    !ignore.includes(name) && (flags.includePrivate || !_private)

  return _topo({cwd, pkgFilter, depFilter})
}
