import {$, tempy, fs, path} from 'zx-extra'
import {memoizeBy} from '../../../util.js'
import {exec} from '../exec.js'
import {deliver, filterActive, prepare, runChannel, buildParcel} from '../../courier/index.js'
import {npmPersist} from '../../api/npm.js'
import {getRepo} from '../../api/git.js'
import {formatReleaseNotes} from '../generators/notes.js'
import {isNpmPublished} from '../../courier/channels/npm.js'
import {ghPrepareAssets} from '../../api/gh.js'
import {asTuple} from '../../../util.js'
import {rollbackRelease} from './teardown.js'

// Prepare delivery artifacts in temp directories.
// After this step, everything courier needs is outside the project dir.
const prepareArtifacts = async (pkg, activeTransport) => {
  const artifacts = {}

  // Persist manifest (version bump) — always, even for non-npm packages.
  await npmPersist(pkg)

  // npm: pack into tarball so courier publishes without touching project dir.
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

  return artifacts
}

export const publish = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  if (pkg.version !== pkg.manifest.version)
    throw new Error('package.json version not synced')

  const {run = exec, channels: channelNames = [], flags} = ctx
  const snapshot = !!flags.snapshot

  // Transport channels go through courier; cmd stays depot-side.
  const transportNames = channelNames.filter(n => n !== 'cmd')
  const activeTransport = filterActive(transportNames, pkg, {snapshot})

  // Prepare phase: serial pkg mutations (e.g. meta injects into ghAssets).
  await prepare(activeTransport, pkg)

  // Stage artifacts in temp directories — after this, courier is project-dir-free.
  const artifacts = await prepareArtifacts(pkg, activeTransport)

  const parcel = buildParcel(pkg, ctx, {
    snapshot,
    channels: activeTransport,
    ...artifacts,
  })

  const cmdActive = channelNames.includes('cmd') && filterActive(['cmd'], pkg, {snapshot}).length > 0

  try {
    await deliver(parcel)
    if (cmdActive) await runChannel('cmd', pkg, run)
  } catch (e) {
    if (!snapshot && isNpmPublished(pkg)) await rollbackRelease(pkg, ctx)
    throw e
  }

  pkg.published = true
})
