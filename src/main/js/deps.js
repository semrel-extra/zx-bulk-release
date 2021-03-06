import {semver} from 'zx-extra'

export const depScopes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

export const traverseDeps = async (pkg, packages, fn) => {
  const {manifest} = pkg

  for (let scope of depScopes) {
    const deps = manifest[scope]
    if (!deps) continue

    for (let [name, version] of Object.entries(deps)) {
      if (!packages[name]) continue

      await fn(pkg, {name, version, deps, scope, pkg: packages[name]})
    }
  }
}

export const updateDeps = async (pkg, packages) => {
  const changes = []

  await traverseDeps(pkg, packages, async (_, {name, version, deps, scope, pkg: dep}) => {
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
  })

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
