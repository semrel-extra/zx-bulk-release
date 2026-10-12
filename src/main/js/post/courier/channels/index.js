import gitTag from './git-tag.js'
import meta from './meta.js'
import npm from './npm.js'
import ghRelease from './gh-release.js'
import ghPages from './gh-pages.js'
import changelog from './changelog.js'
import cmd from './cmd.js'

export const channels = {'git-tag': gitTag, meta, npm, 'gh-release': ghRelease, 'gh-pages': ghPages, changelog, cmd}
export const defaultOrder = ['git-tag', 'meta', 'npm', 'gh-release', 'gh-pages', 'changelog', 'cmd']

// Delivery order is courier policy, not parcel data: the claim gates everything else,
// the package goes out next, and the announcements follow what has been published.
export const STAGES = ['claim', 'publish', 'announce']

export const stageOf = (channel) => channels[channel]?.stage || 'publish'

export const stepsOf = (names) =>
  STAGES.map(stage => names.filter(n => stageOf(n) === stage)).filter(step => step.length)
