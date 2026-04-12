import {$, tempy, fs, path} from 'zx-extra'
import {memoizeBy, asTuple} from '../../../util.js'
import {prepare, getActiveChannels} from '../../courier/index.js'
import {buildParcels, PARCELS_DIR} from '../../parcel/index.js'
import {npmPersist} from '../../api/npm.js'
import {getRepo} from '../../api/git.js'
import {formatReleaseNotes} from '../generators/notes.js'
import {ghPrepareAssets} from '../../api/gh.js'
import {packTar, hashFile} from '../../tar.js'

export const pack = memoizeBy(async (pkg, ctx = pkg.ctx) => {
  const {channels: channelNames = [], flags} = ctx
  const snapshot = !!flags.snapshot
  const active = getActiveChannels(pkg, channelNames, snapshot)

  await prepare(active, pkg)
  await npmPersist(pkg)

  const outputDir = flags.pack ? path.resolve(ctx.git.root, typeof flags.pack === 'string' ? flags.pack : PARCELS_DIR) : null
  const stageDir = outputDir || tempy.temporaryDirectory()
  if (outputDir) await fs.ensureDir(outputDir)
  const {repoName, repoHost, originUrl} = await getRepo(pkg.absPath, {basicAuth: pkg.config.ghBasicAuth})
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
    artifacts.assetsDir = await ghPrepareAssets(pkg.config.ghAssets, pkg.absPath)

  const parcels = buildParcels(pkg, ctx, {channels: active, ...artifacts})

  const tars = []
  for (const {channel, manifest, files} of parcels) {
    // Two-pass: pack to temp, hash, rename to final name.
    const tmpPath = path.join(stageDir, `_tmp.${channel}.tar`)
    await packTar(tmpPath, manifest, files)
    const hash = await hashFile(tmpPath)
    const sha7 = ctx.git.sha.slice(0, 7)
    const finalPath = path.join(stageDir, `parcel.${sha7}.${channel}.${pkg.tag}.${hash}.tar`)
    await fs.rename(tmpPath, finalPath)
    tars.push(finalPath)
  }

  pkg.tars = tars
  pkg.activeTransport = active
})
