import {getPkgConfig} from '../config.js'
import {getLatest} from '../processor/meta.js'
import {getRoot, getSha} from '../api/git.js'
import {$} from 'zx-extra'

// Inspired by https://docs.github.com/en/actions/learn-github-actions/contexts
export const contextify = async (pkg, {packages, root, flags}) => {
  pkg.config = await getPkgConfig(pkg.absPath, root.absPath)
  pkg.latest = await getLatest(pkg)
  pkg.context = {
    git: {
      sha: await getSha(pkg.absPath),
      root: await getRoot(pkg.absPath)
    },
    env: $.env,
    flags,
    packages
  }
}
