import {$, fs} from 'zx-extra'

export const tpl = (str, context) =>
  str?.replace(/\$\{\{\s*([.a-z0-9]+)\s*}}/gi, (matched, key) => get(context, key) ?? '')

export const get = (obj, path = '.') => {
    const chunks = path.split('.').filter(Boolean)
    let result = obj

    for (let i = 0, len = chunks.length; i < len && result !== undefined && result !== null; i++) {
        result = result[chunks[i]]
    }

    return result
}

export const set = (obj, path, value) => {
    const chunks = path.split('.').filter(Boolean)
    let result = obj

    for (let i = 0, len = chunks.length; i < len && result !== undefined && result !== null; i++) {
        if (i === len - 1) {
            result[chunks[i]] = value
        } else {
            result[chunks[i]] = result[chunks[i]] || {}
            result = result[chunks[i]]
        }
    }

    return result
}

export const runHook = async (pkg, name) => {
    const cmd = tpl(pkg.config[name], {...pkg, ...pkg.context})

    if (cmd) {
        log({pkg})(`run ${name} '${cmd}'`)
        await $.o({cwd: pkg.absPath, quote: v => v, preferLocal: true})`${cmd}`
    }
}

export const restJoin = (rest, context, def) => tpl(rest.filter(Boolean).join(' ') || def, context)

export const createReporter = (file, logger = console) => {
    const state = {
        status: 'initial',
        queue: [],
        packages: [],
        events: [],
    }

    return {
        setQueue(queue, packages) {
            state.queue = queue
            state.packages = queue.map(name => {
                const {manifest: {version}, absPath} = packages[name]
                return {
                    status: 'initial',
                    name,
                    version,
                    path: absPath
                }
            })
        },
        getState(key, pkgName) {
            const _state = pkgName ? state.packages.find(({name}) => name === pkgName) : state
            return get(_state, key)
        },
        setState(key, value, pkgName) {
            const _state = pkgName ? state.packages.find(({name}) => name === pkgName) : state
            set(_state, key, value)
        },
        setStatus(status, name) {
            this.setState('status', status, name)

            this.persistState()
        },
        getStatus (status, name) {
            return this.getState('status', name)
        },
        log(ctx = {}) { return (...chunks) => {
            const {pkg, scope = pkg?.name || '~', level = 'info'} = ctx
            const msg = chunks.map(c => typeof c === 'string' ? tpl(c, ctx) : c)
            const event = {msg, scope, date: Date.now(), level}
            state.events.push(event)
            logger[level](`[${scope}]`, ...msg)
        }},
        persistState() {
            file && fs.outputJsonSync(file, state)
        }
    }
}

export const log = (ctx) => {
    if (!$.r) {
        $.r = createReporter()
    }

    return $.r.log(ctx)
}

