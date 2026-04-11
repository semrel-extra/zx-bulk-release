import {$, tempy, fs, path} from 'zx-extra'
import {memoizeBy} from '../../../util.js'
import {filterActive, prepare, buildParcel} from '../../courier/index.js'
import {npmPersist} from '../../api/npm.js'
import {getRepo} from '../../api/git.js'
import {formatReleaseNotes} from '../generators/notes.js'
import {ghPrepareAssets} from '../../api/gh.js'
import {asTuple} from '../../../util.js'
import {packTar} from '../../tar.js'

// Pack delivery artifacts into tar containers — one per active channel.
// After this step, everything courier needs is in self-contained tar files.
// Naming: {tag}.{channel}.tar
export const pack = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  const {channels: channelNames = [], flags} = ctx
  const snapshot = !!flags.snapshot

  const transportNames = channelNames.filter(n => n !== 'cmd')
  const activeTransport = filterActive(transportNames, pkg, {snapshot})

  await prepare(activeTransport, pkg)
  await npmPersist(pkg)

  // Single staging directory for all artifacts and output tars.
  const stageDir = tempy.temporaryDirectory()
  const artifacts = {}

  if (activeTransport.includes('npm')) {
    const out = await $({cwd: pkg.absPath})`npm pack --pack-destination ${stageDir}`
    artifacts.npmTarball = path.join(stageDir, out.toString().trim())
  }

  const {repoName, repoHost, originUrl} = await getRepo(pkg.absPath, {basicAuth: pkg.config.ghBasicAuth})
  artifacts.repoName = repoName
  artifacts.repoHost = repoHost
  artifacts.originUrl = originUrl

  if (activeTransport.includes('gh-release') || activeTransport.includes('changelog'))
    artifacts.releaseNotes = await formatReleaseNotes(pkg)

  if (activeTransport.includes('gh-pages')) {
    const [, from = 'docs'] = asTuple(pkg.config.ghPages, ['branch', 'from'])
    const docsDir = path.join(stageDir, 'docs')
    await fs.copy(path.join(pkg.absPath, from), docsDir)
    artifacts.docsDir = docsDir
  }

  if (activeTransport.includes('gh-release') && pkg.config.ghAssets?.length)
    artifacts.assetsDir = await ghPrepareAssets(pkg.config.ghAssets, pkg.absPath)

  const parcel = buildParcel(pkg, ctx, {snapshot, channels: activeTransport, ...artifacts})

  const tars = {}
  for (const [channel, {manifest, files}] of Object.entries(parcel.channels)) {
    const tarPath = path.join(stageDir, `${pkg.tag}.${channel}.tar`)
    await packTar(tarPath, manifest, files)
    tars[channel] = tarPath
  }

  pkg.tars = tars
  pkg.activeTransport = activeTransport
})
