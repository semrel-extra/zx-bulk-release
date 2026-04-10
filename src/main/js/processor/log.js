import {$, fs} from 'zx-extra'
import {get, set, tpl} from '../util.js'

// Credential redactor: masks tokens/passwords that may leak into log output.
// Secrets are registered via `log.secret(value)` — typically once, when env/config is parsed.
const secrets = new Set()
export const redact = (v) => {
  if (!secrets.size) return v
  if (typeof v === 'string') {
    for (const s of secrets) v = v.replaceAll(s, '***')
    return v
  }
  return v
}

export const log = (ctx) =>
  $.report
    ? $.report.log(ctx)
    : console.log

log.info = (...args) => log()(...args)
log.warn = (...args) => log({level: 'warn'})(...args)
log.error = (...args) => log({level: 'error'})(...args)
log.secret = (...values) => values.forEach(v => { if (v) secrets.add(String(v)) })

export const createReport = ({logger = console, packages = {}, queue = [], flags} = {}) => ({
  logger,
  flags,
  file: flags.report || flags.file,
  status: 'initial',
  events: [],
  queue,
  packages: Object.entries(packages).reduce((acc, [name, {manifest: {version}, absPath, relPath}]) => {
    acc[name] = {
      status: 'initial',
      name,
      version,
      path: absPath,
      relPath
    }
    return acc
  }, {}),
  get(key, pkgName) {
    return get(
      pkgName ? this.packages[pkgName] : this,
      key
    )
  },
  set(key, value, pkgName) {
    // set({k1: v1, k2: v2}, pkgName) — batch
    if (key && typeof key === 'object') {
      const target = value ? this.packages[value] : this
      for (const [k, v] of Object.entries(key)) set(target, k, v)
      return this
    }
    set(
      pkgName ? this.packages[pkgName] : this,
      key,
      value
    )
    return this
  },
  setStatus(status, name) {
    this.set('status', status, name)
    this.save()
    return this
  },
  getStatus(status, name) {
    return this.get('status', name)
  },
  log(ctx = {}) {
    return function (...chunks) {
      const {pkg, scope = pkg?.name || $.scope || '~', level = 'info'} = ctx
      const msg = chunks.map(c => redact(typeof c === 'string' ? tpl(c, ctx) : c))
      const event = {msg, scope, date: Date.now(), level}
      this.events.push(event)
      logger[level](`[${scope}]`, ...msg)

      return this
    }.bind(this)
  },
  save() {
    this.file && fs.outputJsonSync(this.file, this)
    return this
  }
})
