import {$, tempy, fs, path} from 'zx-extra'
import {memoizeBy, asTuple} from '../../../util.js'
import {api} from '../../api/index.js'
import {prepare, getActiveChannels} from '../../courier/index.js'
import {buildParcels, PARCELS_DIR} from '../../parcel/index.js'
import {sanitizePkgName} from '../../parcel/build.js'
import {formatReleaseNotes} from '../generators/notes.js'
import {packTar, hashFile} from '../../tar.js'

export const pack = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  const {channels: channelNames = [], flags} = ctx
  const snapshot = !!flags.snapshot
  // In split pipeline, receive already decided which channels are active
  const active = pkg.contextChannels || getActiveChannels(pkg, channelNames, snapshot)

  await prepare(active, pkg)
  await api.npm.npmPersist(pkg)

  const outputDir = flags.pack ? path.resolve(ctx.git.root, typeof flags.pack === 'string' ? flags.pack : PARCELS_DIR) : null
  const stageDir = outputDir || tempy.temporaryDirectory()
  if (outputDir) await fs.ensureDir(outputDir)
  const {repoName, repoHost, originUrl} = await api.git.getRepo(pkg.absPath, {basicAuth: pkg.config.ghBasicAuth})
  const artifacts = {repoName, repoHost, originUrl}

  if (active.includes('npm')) {
    const out = await $({cwd: pkg.absPath})`npm pack --pack-destination ${stageDir}`
    artifacts.npmTarball = path.join(stageDir, out.toString().trim())
  }
  if (active.includes('gh-release') || active.includes('changelog'))
    artifacts.releaseNotes = await formatReleaseNotes(pkg)
  if (active.includes('gh-pages')) {
    const [, from = 'docs'] = asTuple(pkg.config.ghPages, ['branch', 'from'])
    artifacts.docsDir = path.join(stageDir, 'docs')
    await fs.copy(path.join(pkg.absPath, from), artifacts.docsDir)
  }
  if (active.includes('gh-release') && pkg.config.ghAssets?.length)
    artifacts.assetsDir = await api.gh.ghPrepareAssets(pkg.config.ghAssets, pkg.absPath)

  const parcels = buildParcels(pkg, ctx, {channels: active, ...artifacts})

  const tars = []
  for (const {channel, manifest, files} of parcels) {
    // Two-pass: pack to temp, hash, rename to final name.
    const tmpPath = tempy.temporaryFile({extension: 'tar'})
    await packTar(tmpPath, manifest, files)
    const hash = await hashFile(tmpPath)
    const sha7 = ctx.git.sha.slice(0, 7)
    const safeName = sanitizePkgName(pkg.name)
    const finalPath = path.join(stageDir, `parcel.${sha7}.${channel}.${safeName}.${pkg.version}.${hash}.tar`)
    await fs.move(tmpPath, finalPath)
    tars.push(finalPath)
  }

  pkg.tars = tars
  pkg.activeTransport = active
})
