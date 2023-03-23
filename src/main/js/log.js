import {$, fs} from 'zx-extra'
import {get, set, tpl} from './util.js'

export const log = (ctx) => {
  if ($.report) {
    return $.report.log(ctx)
  }

  return console.log
}

export const createReport = ({logger = console, file = null} = {}) => ({
  logger,
  file,
  status: 'initial',
  queue: [],
  packages: {},
  events: [],
  setPackages(packages) {
    this.packages = Object.entries(packages).reduce((acc, [name, {manifest: {version}, absPath, relPath}]) => {
      acc[name] = {
        status: 'initial',
        name,
        version,
        path: absPath,
        relPath
      }
      return acc
    }, {})
    return this
  },
  get(key, pkgName) {
    return get(
      pkgName ? this.packages[pkgName] : this,
      key
    )
  },
  set(key, value, pkgName) {
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
      const {pkg, scope = pkg?.name || '~', level = 'info'} = ctx
      const msg = chunks.map(c => typeof c === 'string' ? tpl(c, ctx) : c)
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
