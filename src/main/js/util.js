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

export const msgJoin = (rest, context, def) => tpl(rest.filter(Boolean).join(' ') || def, context)

// Normalize "string | {k1, k2, ...}" config shape to a positional tuple.
// Used for shorthand configs like ghPages: 'branch from to msg' or {branch, from, to, msg}.
export const asTuple = (opts, keys) => typeof opts === 'string'
  ? opts.split(' ')
  : keys.map(k => opts[k])

export const attempt = async (times, action, fix) => {
  for (let i = times; i > 0; i--) {
    try { return await action() }
    catch (e) {
      if (i === 1 || !fix) throw e
      await fix(e)
    }
  }
}

export const attempt2 = (action, fix) => attempt(2, action, fix)
export const attempt3 = (action, fix) => attempt(3, action, fix)

export const memoStore = new Map()

export const memoizeBy = (fn, getKey = v => v) => {
  const memoized = async (...args) => {
    const store = $.memo || memoStore
    if (!store.has(memoized)) store.set(memoized, new Map())
    const memo = store.get(memoized)
    const key = await getKey(...args)
    if (memo.has(key)) return memo.get(key)

    const value = Promise.resolve().then(() => fn(...args))
    memo.set(key, value)
    value.catch(() => memo.delete(key))
    return value
  }
  return memoized
}

export const camelize = s => s.replace(/-./g, x => x[1].toUpperCase())

export const asArray = v => Array.isArray(v) ? v : [v]
