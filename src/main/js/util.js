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

export const getPromise = () => {
    let resolve, reject
    const promise = new Promise((...args) => {
        [resolve, reject] = args
    })

    return {
        resolve,
        reject,
        promise,
    }
}

export const keyByValue = (obj, value) => Object.keys(obj).find((key) => obj[key] === value)

export const memoizeBy = (fn, memo = new Map(), getKey = v => v) => (...args) => {
  const key = getKey(...args)
  if (memo.has(key)) {
    return memo.get(key)
  }

  const value = fn(...args)
  memo.set(key, value)
  return value
}
