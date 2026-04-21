import {$, tempy, fs, path} from 'zx-extra'
import {memoizeBy, asTuple} from '../../../util.js'
import {api} from '../../api/index.js'
import {prepare, getActiveChannels} from '../../courier/index.js'
import {buildParcels, PARCELS_DIR} from '../../parcel/index.js'
import {sanitizePkgName} from '../../parcel/build.js'
import {formatReleaseNotes} from '../generators/notes.js'
import {packTar, hashFile} from '../../tar.js'

// Strip inherited `npm_*` / `npm_config_*` env vars. When zbr is invoked via `npx`
// or `npm run`, the parent npm pollutes the env and the child packer (npm/yarn/pnpm)
// can misinterpret it — on npm 11+ this surfaces as "Exit prior to config file resolving".
const cleanPackerEnv = () => Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^npm_/i.test(k))
)

// pack via selected package manager. All three produce an npm-compatible tarball,
// honoring `files`/`.npmignore`, bin/man normalization, and prepack hooks.
const packers = {
  async npm(pkg, destDir) {
    const out = await $({cwd: pkg.absPath, env: cleanPackerEnv()})`npm pack --pack-destination ${destDir}`
    return path.join(destDir, out.toString().trim().split('\n').pop())
  },
  async pnpm(pkg, destDir) {
    const out = await $({cwd: pkg.absPath, env: cleanPackerEnv()})`pnpm pack --pack-destination ${destDir}`
    return path.join(destDir, out.toString().trim().split('\n').pop())
  },
  async yarn(pkg, destDir) {
    // yarn berry: `yarn pack -o <path>`. Name is under our control — no stdout parsing.
    const target = path.join(destDir, `${sanitizePkgName(pkg.name)}-${pkg.version}.tgz`)
    await $({cwd: pkg.absPath, env: cleanPackerEnv()})`yarn pack -o ${target}`
    return target
  },
}

const packNpmTarball = async (pkg, destDir) => {
  const packer = pkg.config.npmPacker || 'npm'
  const fn = packers[packer]
  if (!fn) throw new Error(`unknown npmPacker: ${packer}`)
  return fn(pkg, destDir)
}

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
    artifacts.npmTarball = await packNpmTarball(pkg, stageDir)
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
