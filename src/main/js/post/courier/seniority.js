import {$, semver} from 'zx-extra'
import {parseTag} from '../depot/generators/tag.js'

export const hasHigherVersion = async (cwd, name, version) => {
  const output = (await $({cwd, nothrow: true})`git ls-remote --tags origin`).toString()
  if (!output) return false

  for (const line of output.split('\n')) {
    const ref = line.split('\t')[1]?.replace('refs/tags/', '')
    if (!ref) continue
    const parsed = parseTag(ref)
    if (!parsed || parsed.name !== name) continue
    try {
      if (semver.gt(parsed.version, version)) return true
    } catch { /* unparseable version, skip */ }
  }

  return false
}
