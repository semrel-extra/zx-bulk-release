import {semver} from 'zx-extra'

export const depScopes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

export const updateDeps = async (pkg, packages) => {
  const {manifest} = pkg
  const changes = []

  for (let scope of depScopes) {
    const deps = manifest[scope]
    if (!deps) continue

    for (let [name, version] of Object.entries(deps)) {
      const _version = packages[name]?.version

      if (!_version || semver.satisfies(_version, version)) continue

      deps[name] = _version

      changes.push({
        group: 'Dependencies',
        releaseType: 'patch',
        change: 'perf',
        subj: `perf: ${name} updated to ${_version}`,
      })
    }
  }

  return changes
}
