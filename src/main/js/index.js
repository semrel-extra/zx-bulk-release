import {fs} from 'zx-extra'
import {topo} from '@semrel-extra/topo'
import {updateDeps} from './deps.js'
import {getSemanticChanges, resolvePkgVersion} from './analyze.js'
import {publish, getLatest} from './publish.js'

export const run = async ({cwd = process.cwd(), env = process.env, flags = {}} = {}) => {
  const {packages, queue} = await topo({cwd})
  const dryRun = flags['dry-run'] || flags.dryRun

  for (let name of queue) {
    const pkg = packages[name]
    pkg.latest = await getLatest(cwd, name)

    const semanticChanges = await getSemanticChanges(pkg.absPath, pkg.latest.tag?.ref)
    const depsChanges = await updateDeps(pkg, packages)
    const changes = [...semanticChanges, ...depsChanges]

    pkg.changes = changes
    pkg.version = resolvePkgVersion(changes, pkg.latest.tag?.version || pkg.manifest.version)
    pkg.manifest.version = pkg.version

    if (changes.length === 0) continue
    console.log(`semantic changes of '${name}'`, changes)

    if (dryRun) continue

    await fs.writeJson(pkg.manifestPath, pkg.manifest, {spaces: 2})
    await publish(pkg, env)
  }
}
