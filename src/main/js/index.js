import {fs} from 'zx-extra'
import {updateDeps} from './deps.js'
import {getSemanticChanges, resolvePkgVersion} from './analyzer.js'
import { topo } from '@semrel-extra/topo'

import {publish, getLatest} from './publish.js'
import {formatTag} from './tag.js'

export {parseTag, formatTag, getTags} from './tag.js'

export { topo }

export const run = async ({cwd = process.cwd(), env = process.env} = {}) => {
  const {packages, queue} = await topo({cwd})

  for (let name of queue) {
    const pkg = packages[name]
    pkg.latest = await getLatest(cwd, name)

    const semanticChanges = await getSemanticChanges(pkg.absPath, pkg.latest.tag?.ref)
    const depsChanges = await updateDeps(pkg, packages)
    const changes = [...semanticChanges, ...depsChanges]

    pkg.version = resolvePkgVersion(changes, pkg.latest.tag?.version || pkg.manifest.version)
    pkg.manifest.version = pkg.version

    if (changes.length === 0) continue

    console.log(`semantic changes of '${name}'`, changes)

    await fs.writeJson(pkg.manifestPath, pkg.manifest, {spaces: 2})

    await publish(pkg, env)
  }
}
