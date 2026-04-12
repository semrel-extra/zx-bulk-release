import {glob, path, fs} from 'zx-extra'
import {log} from '../log.js'
import {parcelChannel} from '../courier/directive.js'

const PARCELS_DIR = 'parcels'

export const runVerify = async ({cwd, flags}) => {
  const inputDir = typeof flags.verify === 'string' ? flags.verify : PARCELS_DIR
  const contextPath = typeof flags.context === 'string' ? flags.context : path.resolve(cwd, '.zbr-context.json')
  const outputDir = path.resolve(cwd, PARCELS_DIR)

  log.info(`verifying parcels in ${inputDir} against ${contextPath}`)

  let context
  try { context = await fs.readJson(contextPath) } catch { context = null }
  if (!context || context.status !== 'proceed') {
    throw new Error(`no valid context at ${contextPath}`)
  }

  const tars = await glob(path.join(inputDir, 'parcel.*.tar'))
  if (!tars.length) {
    log.info('no parcels to verify')
    return
  }

  const {sha7, packages: expected} = context
  const errors = []
  const verified = []

  for (const tarPath of tars) {
    const name = path.basename(tarPath)

    // sha7 prefix must match
    if (!name.startsWith(`parcel.${sha7}.`)) {
      errors.push(`sha mismatch: ${name}`)
      continue
    }

    const channel = parcelChannel(name)
    if (!channel) {
      errors.push(`malformed name: ${name}`)
      continue
    }

    if (channel === 'directive') {
      verified.push(tarPath)
      continue
    }

    // match to an expected package by tag
    const belongsTo = Object.entries(expected).find(([, pkg]) =>
      pkg.tag && name.includes(`.${pkg.tag}.`)
    )
    if (!belongsTo) {
      errors.push(`unexpected parcel (no matching package): ${name}`)
      continue
    }

    const [pkgName, pkg] = belongsTo
    if (!pkg.channels.includes(channel)) {
      errors.push(`unexpected channel '${channel}' for ${pkgName}: ${name}`)
      continue
    }

    verified.push(tarPath)
  }

  if (errors.length) {
    for (const e of errors) log.error(`verify: ${e}`)
    throw new Error(`parcel verification failed: ${errors.length} error(s)`)
  }

  // copy verified parcels to output
  if (path.resolve(inputDir) !== outputDir) {
    await fs.ensureDir(outputDir)
    for (const tarPath of verified) {
      await fs.copy(tarPath, path.join(outputDir, path.basename(tarPath)))
    }
    log.info(`${verified.length} parcel(s) verified and copied to ${outputDir}`)
  } else {
    log.info(`${verified.length} parcel(s) verified in place`)
  }
}
