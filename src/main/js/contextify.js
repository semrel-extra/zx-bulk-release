// Inspired by https://docs.github.com/en/actions/learn-github-actions/contexts

import {getConfig} from './config.js'
import {getLatest} from './publish.js'
import {$} from 'zx-extra'

export const contextify = async (pkg, packages, root) => {
  pkg.config = await getConfig(pkg.absPath, root.absPath)
  pkg.latest = await getLatest(pkg)
  pkg.context = {
    git: {
      sha: (await $`git rev-parse HEAD`).toString().trim(),
      root: (await $`git rev-parse --show-toplevel`).toString().trim(),
    },
    env: $.env,
    packages
  }
}