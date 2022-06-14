import {$, ctx, semver} from 'zx-extra'

export {parseTag, formatTag, getTags} from './tag.js'

export { topo } from '@semrel-extra/topo'

export const run = async (env = process.env) => {
  await $`echo "hello"`
}

export const getPkgCommits = async (cwd, since) => ctx(async ($) => {
  $.cwd = cwd

  const range = since ? `${since}..HEAD` : 'HEAD'

  return (await $.raw`git log ${range} --format=+++%s__%b__%h__%H -- .`)
    .toString()
    .split('+++')
    .filter(Boolean)
    .map(msg => {
      const [subj, body, short, hash] = msg.split('__').map(raw => raw.trim())
      return {subj, body, short, hash}
    })
})
