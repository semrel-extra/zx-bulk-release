import {$} from 'zx-extra'

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
        console.log(`[${pkg.name}] run ${name} '${cmd}'`)
        await $.o({cwd: pkg.absPath, quote: v => v})`${cmd}`
    }
}
