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

export const buildContext = (packages, queue, sha, {getChannels} = {}) => {
  const pkgs = {}
  for (const name of queue) {
    const pkg = packages[name]
    if (!pkg.releaseType || pkg.skipped) continue
    pkgs[name] = {
      version:  pkg.version,
      tag:      pkg.tag,
      channels: getChannels ? getChannels(pkg) : [],
    }
  }

  return {
    status: 'proceed',
    sha,
    sha7: sha.slice(0, 7),
    packages: pkgs,
  }
}
