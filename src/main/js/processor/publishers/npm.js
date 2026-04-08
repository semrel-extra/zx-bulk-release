import {npmPublish} from '../api/npm.js'

// Domain predicate: does this package get published to npm?
// Private packages and those with `npmPublish: false` are git-tag-only —
// the tag itself IS the release.
export const isNpmPublished = (pkg) =>
  !pkg.manifest.private && pkg.config.npmPublish !== false

export default {
  name:     'npm',
  when:     isNpmPublished,
  run:      (pkg) => npmPublish(pkg),
  snapshot: true,
  // No undo: npm unpublish is unreliable (time-limited, cached by mirrors).
}
