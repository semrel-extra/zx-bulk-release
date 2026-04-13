import {$, glob, path, tempy} from 'zx-extra'
import {createReport, log} from '../log.js'
import {deliver} from '../courier/index.js'
import {PARCELS_DIR} from '../parcel/index.js'

export const runDeliver = async ({env, flags}) => {
  const dir = typeof flags.deliver === 'string' ? flags.deliver : PARCELS_DIR
  const report = createReport({flags})

  $.memo = new Map()
  $.report = report

  report.setStatus('inspecting')

  const tars = await glob(path.join(dir, 'parcel.*.tar'))
  if (!tars.length) return report.setStatus('success').log(`no parcels in ${dir}`)

  const cwd = await ensureGitRepo(env)

  report.setStatus('delivering').log(`parcels: ${tars.length}`)
  const result = await deliver(tars, env, {dryRun: flags.dryRun, cwd})
  report.set('delivery', result).setStatus('success')

  log.info(`done: ${result.delivered} delivered, ${result.skipped} skipped`)
}

const ensureGitRepo = async (env) => {
  try {
    return (await $({quiet: true})`git rev-parse --show-toplevel`).toString().trim()
  } catch {
    // Deliver runs in a clean runner with no checkout — init a temp repo for git push operations.
    const tmp = tempy.temporaryDirectory()
    const repo = env.GITHUB_REPOSITORY || ''
    const token = env.GH_TOKEN || env.GITHUB_TOKEN || ''
    const user = env.GH_USER || env.GH_USERNAME || 'x-access-token'
    const server = env.GITHUB_SERVER_URL || 'https://github.com'
    const host = new URL(server).host
    const origin = token
      ? `https://${user}:${token}@${host}/${repo}.git`
      : `${server}/${repo}.git`

    await $({quiet: true})`git init ${tmp}`
    await $({quiet: true, cwd: tmp})`git remote add origin ${origin}`
    log.info(`initialized temp git repo for delivery: ${repo}`)
    return tmp
  }
}
