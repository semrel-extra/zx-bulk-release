import {$, glob, path} from 'zx-extra'
import {createReport, log} from '../log.js'
import {deliver} from '../courier/index.js'
import {PARCELS_DIR} from '../parcel/index.js'

export const runDeliver = async ({env, flags}) => {
  const dir = typeof flags.deliver === 'string' ? flags.deliver : PARCELS_DIR
  const report = createReport({flags})

  $.memo = new Map()
  $.report = report

  try {
    report.setStatus('inspecting')

    const tars = await glob(path.join(dir, 'parcel.*.tar'))
    if (!tars.length) return report.setStatus('success').log(`no parcels in ${dir}`)

    report.setStatus('delivering').log(`parcels: ${tars.length}`)
    const result = await deliver(tars, env, {dryRun: flags.dryRun})
    report.set('delivery', result)

    log.info(`done: ${result.delivered} delivered, ${result.skipped} skipped`)

    if (result.invalid.length) throw new Error(`${result.invalid.length} invalid parcel(s) not delivered, see the warnings above`)
    report.setStatus('success')
  } catch (e) {
    report.error(e).setStatus('failure')
    throw e
  }
}
