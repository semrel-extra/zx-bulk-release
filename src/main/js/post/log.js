import {$, fs} from 'zx-extra'
import {get, set} from '../util.js'

// Credential redactor: masks tokens/passwords that may leak into log output.
// Secrets are registered via `log.secret(value)` — typically once, when env/config is parsed.
const secrets = new Set()
export const redact = (v) => {
  if (!secrets.size || typeof v !== 'string') return v
  for (const s of secrets) v = v.replaceAll(s, '***')
  return v
}

// Module-level logger. Delegates to $.report when inside a release run, falls back to console.
const sanitize = (args) => args.map(a => typeof a === 'string' ? redact(a) : a)
const r = () => $.report || console

export const log = Object.assign(
  (...args) => r().log(...sanitize(args)),
  {
    info:   (...args) => r().log(...sanitize(args)),
    warn:   (...args) => r().warn(...sanitize(args)),
    error:  (...args) => r().error(...sanitize(args)),
    secret: (...values) => values.forEach(v => { if (v) secrets.add(String(v)) }),
  }
)

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
  _log(level, ...chunks) {
    const scope = $.scope || '~'
    const msg = sanitize(chunks)
    this.events.push({msg, scope, date: Date.now(), level})
    logger[level === 'info' ? 'log' : level](`[${scope}]`, ...msg)
    return this
  },
  log(...chunks)   { return this._log('info', ...chunks) },
  warn(...chunks)  { return this._log('warn', ...chunks) },
  error(...chunks) { return this._log('error', ...chunks) },
  save() {
    this.file && fs.outputJsonSync(this.file, this)
    return this
  }
})
