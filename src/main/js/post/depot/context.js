import {fs, path} from 'zx-extra'

export const CONTEXT_FILE = 'zbr-context.json'

export const writeContext = async (cwd, context) => {
  const filePath = path.resolve(cwd, CONTEXT_FILE)
  await fs.writeJson(filePath, context, {spaces: 2})
  return filePath
}

export const readContext = async (filePath) => {
  let data
  try { data = await fs.readJson(filePath) } catch {
    throw new Error(`context not found: ${filePath}`)
  }

  if (!data || typeof data !== 'object') throw new Error(`context is not an object: ${filePath}`)
  if (!data.status)                      throw new Error(`context missing status: ${filePath}`)
  if (data.status === 'proceed') {
    if (!data.sha || !data.sha7)         throw new Error(`context missing sha: ${filePath}`)
    if (!data.packages || typeof data.packages !== 'object')
      throw new Error(`context missing packages: ${filePath}`)
  }

  return data
}

// prev: what each package waits on, as in the directive; snapshot: whether npm publishes under the snapshot tag.
export const buildContext = (packages, queue, sha, {getChannels, getPopulate, timestamp, prev, snapshot} = {}) => {
  const pkgs = {}
  for (const name of queue) {
    const pkg = packages[name]
    if (!pkg.releaseType || pkg.skipped) continue
    pkgs[name] = {
      version:  pkg.version,
      tag:      pkg.tag,
      channels: getChannels ? getChannels(pkg) : [],
      populate: getPopulate ? getPopulate(pkg) : undefined,
    }
  }

  return {
    status: 'proceed',
    sha,
    sha7: sha.slice(0, 7),
    timestamp,  // commit time: directives are delivered oldest first
    snapshot,
    prev: prev && prevOf(prev, Object.keys(pkgs)),
    packages: pkgs,
  }
}

// The dependencies among the given packages only, the way the directive keeps them.
export const prevOf = (prev, names) => {
  const listed = new Set(names)
  return Object.fromEntries(names
    .map(name => [name, (prev.get(name) || []).filter(d => listed.has(d))])
    .filter(([, deps]) => deps.length))
}
