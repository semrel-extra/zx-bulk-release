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

export const runHook = async (pkg, name) => {
    const cmd = tpl(pkg.config[name], {...pkg, ...pkg.context})

    if (cmd) {
        log({pkg})(`run ${name} '${cmd}'`)
        await $.o({cwd: pkg.absPath, quote: v => v})`${cmd}`
    }
}

export const restJoin = (rest, context, def) => tpl(rest.filter(Boolean).join(' ') || def, context)

export const createReporter = ({file = false, logger = console} = {}) => {
    const state = {
        queue: [],
        packages: [],
        events: [],
    }

    return {
        state,
        setQueue(queue) {
            state.queue = queue
            this.log()('queue:', queue)
        },
        setPackages(packages) {
            state.packages = Object.values(packages).map(({manifest: {name, version}}) => ({
                name,
                version,
                events: []
            }))
        },
        log(ctx = {}) { return (...chunks) => {
            const {pkg, scope = pkg?.name || '~', level = 'info'} = ctx
            const msg = chunks.map(c => typeof c === 'string' ? tpl(c, ctx) : c)
            const event = {msg, scope, date: Date.now(), level}
            state.events.push(event)
            logger[level](`[${scope}]`, ...msg)
        }},
        persist() {
            file && fs.writeJsonSync(file, state)
        }
    }
}

export const log = (ctx) => {
    if (!$.r) {
        $.r = createReporter()
    }

    return $.r.log(ctx)
}

