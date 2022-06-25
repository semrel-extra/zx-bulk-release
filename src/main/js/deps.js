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
    const next = resolveVersion(version, actual, prev)

    pkg[scope] = {...pkg[scope], [name]: next || version}

    if (!next) return

    deps[name] = next

    changes.push({
      group: 'Dependencies',
      releaseType: 'patch',
      change: 'perf',
      subj: `perf: ${name} updated to ${next}`,
    })
  })

  return changes
}

export const resolveVersion = (decl, actual, prev) => {
  if (!decl) return null

  // https://yarnpkg.com/features/workspaces
  if (decl.startsWith('workspace:')) {
    const [, range, caret] = /^workspace:(([\^~*])?.*)$/.exec(decl)

    decl = caret === range
      ? caret === '*' ? actual : caret + actual
      : range
  }

  if (!semver.satisfies(actual, decl)) return actual === prev ? null : actual

  return decl === prev ? null : decl
}
