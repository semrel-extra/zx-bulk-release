import {glob, path, fs} from 'zx-extra'
import {log} from '../log.js'
import {PARCELS_DIR, verifyParcels} from '../parcel/index.js'
import {CONTEXT_FILE, readContext} from '../depot/context.js'

export const runVerify = async ({cwd, flags}) => {
  const inputDir = typeof flags.verify === 'string' ? flags.verify : PARCELS_DIR
  const contextPath = typeof flags.context === 'string' ? flags.context : path.resolve(cwd, CONTEXT_FILE)
  const outputDir = path.resolve(cwd, PARCELS_DIR)

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

  if (errors.length) {
    for (const e of errors) log.error(`verify: ${e}`)
    throw new Error(`parcel verification failed: ${errors.length} error(s)`)
  }

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
