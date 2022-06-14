import {$, ctx} from 'zx-extra'
import {getLastPkgTag} from './tag.js'
import {updateDeps} from './deps.js'
import {getSemanticChanges, resolvePkgVersion} from './analyzer.js'
import { topo } from '@semrel-extra/topo'

export {parseTag, formatTag, getTags} from './tag.js'

export { topo }

export const run = async ({cwd = process.cwd(), env = process.env}) => {
  const {packages, queue} = await topo({cwd})

  console.log('packages', packages)

  for (let name of queue) {
    const pkg = packages[name]
    const lastTag = getLastPkgTag(pkg.absPath, name)
    const semanticChanges = getSemanticChanges(pkg.absPath, lastTag?.ref)
    const depsChanges = updateDeps(pkg, packages)
    const changes = [...semanticChanges, ...depsChanges]

    pkg.version = resolvePkgVersion(changes, lastTag?.version)
    pkg.manifest.version = pkg.version

    if (changes.length === 0) continue

    console.log('semantic changes', changes)
  }
}
