import {$, ctx, fs, path} from 'zx-extra'
import {getLastPkgTag} from './tag.js'
import {updateDeps} from './deps.js'
import {getSemanticChanges, resolvePkgVersion} from './analyzer.js'
import { topo } from '@semrel-extra/topo'

export {parseTag, formatTag, getTags} from './tag.js'

export { topo }

export const run = async ({cwd = process.cwd(), env = process.env} = {}) => {
  const {packages, queue} = await topo({cwd})

  for (let name of queue) {
    const pkg = packages[name]
    const lastTag = await getLastPkgTag(pkg.absPath, name)
    const semanticChanges = await getSemanticChanges(pkg.absPath, lastTag?.ref)
    const depsChanges = await updateDeps(pkg, packages)
    const changes = [...semanticChanges, ...depsChanges]

    pkg.version = resolvePkgVersion(changes, lastTag?.version)
    pkg.manifest.version = pkg.version

    if (changes.length === 0) continue

    console.log(`semantic changes of '${name}'`, changes)

    await fs.writeJson(pkg.manifestPath, pkg.manifest, {spaces: 2})
    await publish({cwd: pkg.absPath, env})
  }
}

export const publish = async ({cwd, env, registry = 'http://localhost:4873/'}) => ctx(async ($) => {
  $.cwd = cwd
  $.env = env

  await $`npm publish --no-git-tag-version --registry=${registry}`
})
