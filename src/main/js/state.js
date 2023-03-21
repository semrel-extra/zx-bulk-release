import {get, set, tpl} from './util.js'
import {fs} from 'zx-extra'

export const createState = ({logger = console, file = null} = {}) => ({
  logger,
  file,
  status: 'initial',
  queue: [],
  packages: [],
  events: [],
  setQueue(queue, packages) {
    this.queue = queue
    this.packages = queue.map(name => {
      const {manifest: {version}, absPath, relPath} = packages[name]
      return {
        status: 'initial',
        name,
        version,
        path: absPath,
        relPath
      }
    })
  },
  get(key, pkgName) {
    return get(
      pkgName ? this.packages.find(({name}) => name === pkgName) : this,
      key
    )
  },
  set(key, value, pkgName) {
    set(
      pkgName ? this.packages.find(({name}) => name === pkgName) : this,
      key,
      value
    )
  },
  setStatus(status, name) {
    this.set('status', status, name)
    this.save()
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
    }.bind(this)
  },
  save() {
    this.file && fs.outputJsonSync(this.file, this)
  }
})