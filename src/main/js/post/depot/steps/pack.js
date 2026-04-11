import {$, tempy, fs, path} from 'zx-extra'
import {memoizeBy} from '../../../util.js'
import {filterActive, prepare} from '../../courier/index.js'
import {npmPersist} from '../../api/npm.js'
import {getRepo} from '../../api/git.js'
import {formatReleaseNotes} from '../generators/notes.js'
import {ghPrepareAssets} from '../../api/gh.js'
import {asTuple} from '../../../util.js'

// Prepare delivery artifacts in temp directories.
// After this step, everything courier needs is outside the project dir.
export const pack = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  const {channels: channelNames = [], flags} = ctx
  const snapshot = !!flags.snapshot

  const transportNames = channelNames.filter(n => n !== 'cmd')
  const activeTransport = filterActive(transportNames, pkg, {snapshot})

  // Channel prepare phase: serial pkg mutations (e.g. meta injects into ghAssets).
  await prepare(activeTransport, pkg)

  // Persist manifest (version bump) — always, even for non-npm packages.
  await npmPersist(pkg)

  const artifacts = {}

  // npm: pack into tarball so courier delivers without touching project dir.
  if (activeTransport.includes('npm')) {
    const packDir = tempy.temporaryDirectory()
    const out = await $({cwd: pkg.absPath})`npm pack --pack-destination ${packDir}`
    artifacts.npmTarball = path.join(packDir, out.toString().trim())
  }

  // Git info: pre-resolve so courier doesn't need .git access.
  const {repoName, repoAuthedUrl} = await getRepo(pkg.absPath, {basicAuth: pkg.config.ghBasicAuth})
  artifacts.repoName = repoName
  artifacts.repoAuthedUrl = repoAuthedUrl

  // Release notes: pre-render so courier doesn't need git log.
  if (activeTransport.includes('gh-release') || activeTransport.includes('changelog')) {
    artifacts.releaseNotes = await formatReleaseNotes(pkg)
  }

  // gh-pages: copy docs to temp so courier reads from there.
  if (activeTransport.includes('gh-pages')) {
    const [, from = 'docs'] = asTuple(pkg.config.ghPages, ['branch', 'from'])
    const docsDir = tempy.temporaryDirectory()
    await fs.copy(path.join(pkg.absPath, from), docsDir)
    artifacts.docsDir = docsDir
  }

  // gh-release assets: stage to temp.
  if (activeTransport.includes('gh-release') && pkg.config.ghAssets?.length) {
    artifacts.assetsDir = await ghPrepareAssets(pkg.config.ghAssets, pkg.absPath)
  }

  pkg.artifacts = artifacts
  pkg.activeTransport = activeTransport
})
