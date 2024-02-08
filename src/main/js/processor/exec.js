import {tpl} from '../util.js'
import {log} from '../log.js'
import {$} from 'zx-extra'

export const exec = async (pkg, name) => {
  const cmd = tpl(pkg.context.flags[name] ?? pkg.config[name], {...pkg, ...pkg.context})
  const now = Date.now()

  if (cmd) {
    log({pkg})(`run ${name} '${cmd}'`)
    const result = await $.o({cwd: pkg.absPath, quote: v => v, preferLocal: true})`${cmd}`

    log({pkg})(`duration ${name}: ${Date.now() - now}`)
    return result
  }
}
