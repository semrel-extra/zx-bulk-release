import {fs, ctx} from 'zx-extra'
import {topo} from '@semrel-extra/topo'
import {updateDeps} from './deps.js'
import {getSemanticChanges, resolvePkgVersion} from './analyze.js'
import {publish, getLatest} from './publish.js'
import {build} from './build.js'

export const run = ({cwd = process.cwd(), env = process.env, flags = {}} = {}) => ctx(async ($) => {
  const {packages, queue, root} = await topo({cwd})
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

    pkg.build = await build(pkg, packages)

    $.cwd = cwd
    await $`yarn`

    if (dryRun) continue

    await fs.writeJson(pkg.manifestPath, pkg.manifest, {spaces: 2})
    await publish(pkg, env)
  }
})
