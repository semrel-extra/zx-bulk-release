import {glob, path, fs} from 'zx-extra'
import {log} from '../log.js'
import {PARCELS_DIR, verifyParcels, verifyManifests} from '../parcel/index.js'
import {CONTEXT_FILE, readContext} from '../depot/context.js'

export const runVerify = async ({cwd, flags}) => {
  const [inputDir = PARCELS_DIR, outputDir_ = PARCELS_DIR] = typeof flags.verify === 'string' ? flags.verify.split(':') : []
  const outputDir = path.resolve(cwd, outputDir_)
  const contextPath = typeof flags.context === 'string' ? flags.context : path.resolve(cwd, CONTEXT_FILE)

  log.info(`verifying parcels in ${inputDir} against ${contextPath}`)

  const context = await readContext(contextPath)
  if (context.status !== 'proceed') {
    log.info(`context status is '${context.status}', nothing to verify`)
    return
  }

  const tars = await glob(path.join(inputDir, 'parcel.*.tar'))
  if (!tars.length) {
    log.info('no parcels to verify')
    return
  }

  const {verified, errors} = verifyParcels(tars, context)
  errors.push(...await linkErrors(tars), ...await strangerErrors(inputDir, outputDir, verified), ...await verifyManifests(verified, context))

  if (errors.length) {
    for (const e of errors) log.error(`verify: ${e}`)
    throw new Error(`parcel verification failed: ${errors.length} error(s)`)
  }

  if (path.resolve(inputDir) !== outputDir) {
    await fs.ensureDir(outputDir)
    for (const tarPath of verified) {
      await fs.copyFile(tarPath, path.join(outputDir, path.basename(tarPath)))
    }
    log.info(`${verified.length} parcel(s) verified and copied to ${outputDir}`)
  } else {
    log.info(`${verified.length} parcel(s) verified in place`)
  }
}

// A link could point verify and the courier at different files.
const linkErrors = async (tars) => {
  const links = []
  for (const tarPath of tars) if (!(await fs.lstat(tarPath)).isFile()) links.push(tarPath)
  return links.map(t => `not a regular file: ${JSON.stringify(path.basename(t))}`)
}

// Whatever already lies in the output dir would go out with the verified parcels, unverified.
const strangerErrors = async (inputDir, outputDir, verified) => {
  if (path.resolve(inputDir) === outputDir) return []
  const names = new Set(verified.map(t => path.basename(t)))
  const present = await glob(path.join(outputDir, 'parcel.*.tar'))
  return present.filter(t => !names.has(path.basename(t))).map(t => `unverified parcel in ${outputDir}: ${JSON.stringify(path.basename(t))}`)
}
