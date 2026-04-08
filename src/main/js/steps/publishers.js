// Registry of publish targets.
//
// Each publisher is {name, when, run, undo?, snapshot?}:
//   - when(pkg):     should this publisher run for this package?
//   - run(pkg,exec): perform the publish action.
//   - undo(pkg, {tag, version, reason}): reverse the publish action (best effort).
//   - snapshot:      true if this publisher also runs in snapshot mode (subset).
//
// The array order defines run order (inside Promise.all it's effectively parallel,
// but undo walks this list in reverse so teardown happens in LIFO order).

import {npmPublish} from '../api/npm.js'
import {ghPages, ghRelease, ghDeleteReleaseByTag} from '../api/gh.js'
import {getRepo, getRoot} from '../api/git.js'
import {pushMeta, removeMetaArtifact} from '../processor/meta.js'
import {pushChangelog} from './changelog.js'
import {isNpmPublished} from './teardown.js'

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
    when: (pkg) => pkg.config.meta.type !== null,
    run:  (pkg) => pushMeta(pkg),
    undo: removeMetaArtifact,
  },
  {
    name: 'npm',
    when: isNpmPublished,
    run:  (pkg) => npmPublish(pkg),
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
    when: hasCmd,
    run:  (pkg, exec) => exec(pkg, 'publishCmd'),
    snapshot: true,
  },
]
