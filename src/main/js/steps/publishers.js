// Registry of publish targets.
//
// Each publisher is {name, when, prepare?, run, undo?, snapshot?}:
//   - when(pkg):      should this publisher run for this package?
//   - prepare(pkg):   serial pre-phase (mutate pkg state before any run()). Optional.
//   - run(pkg, exec): perform the publish action (called inside Promise.all).
//   - undo(pkg, ctx): reverse the publish action (best effort). Optional.
//   - snapshot:       true if this publisher also runs in snapshot mode (subset).
//
// Teardown walks this list in reverse so undo happens in LIFO order.

import {npmPublish} from '../api/npm.js'
import {ghPages, ghRelease, ghDeleteReleaseByTag} from '../api/gh.js'
import {getRepo, getRoot} from '../api/git.js'
import {prepareMeta, pushMetaBranch, removeMetaArtifact} from '../processor/meta.js'
import {pushChangelog} from './changelog.js'

// Domain predicate: does this package get published to npm?
// Private packages and those with `npmPublish: false` are git-tag-only —
// the tag itself IS the release.
export const isNpmPublished = (pkg) =>
  !pkg.manifest.private && pkg.config.npmPublish !== false

const undoGhRelease = async (pkg, {tag}) => {
  const {ghBasicAuth: basicAuth, ghToken, ghApiUrl} = pkg.config
  if (!ghToken) return
  const cwd = await getRoot(pkg.absPath)
  const {repoName} = await getRepo(cwd, {basicAuth})
  await ghDeleteReleaseByTag({ghApiUrl, ghToken, repoName, tag})
}

const hasCmd = (pkg) => !!(pkg.context?.flags?.publishCmd ?? pkg.config.publishCmd)

export const publishers = [
  {
    name: 'meta',
    when:    (pkg) => pkg.config.meta.type !== null,
    prepare: prepareMeta,
    run:     (pkg) => pushMetaBranch(pkg),
    undo:    removeMetaArtifact,
  },
  {
    name: 'npm',
    when:     isNpmPublished,
    run:      (pkg) => npmPublish(pkg),
    snapshot: true,
    // No undo: npm unpublish is unreliable (time-limited, cached by mirrors).
  },
  {
    name: 'gh-release',
    when: (pkg) => !!pkg.config.ghToken,
    run:  (pkg) => ghRelease(pkg),
    undo: undoGhRelease,
  },
  {
    name: 'gh-pages',
    when: (pkg) => !!pkg.config.ghPages,
    run:  (pkg) => ghPages(pkg),
  },
  {
    name: 'changelog',
    when: (pkg) => !!pkg.config.changelog,
    run:  (pkg) => pushChangelog(pkg),
  },
  {
    name: 'cmd',
    when:     hasCmd,
    run:      (pkg, exec) => exec(pkg, 'publishCmd'),
    snapshot: true,
  },
]
