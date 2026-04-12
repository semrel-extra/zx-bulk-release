import {fs, path} from 'zx-extra'
import {channels as channelRegistry} from '../courier/index.js'

const CONTEXT_FILE = '.zbr-context.json'

export const writeContext = async (cwd, context) => {
  const filePath = path.resolve(cwd, CONTEXT_FILE)
  await fs.writeJson(filePath, context, {spaces: 2})
  return filePath
}

export const readContext = async (cwd) => {
  const filePath = path.resolve(cwd, CONTEXT_FILE)
  try {
    return await fs.readJson(filePath)
  } catch {
    return null
  }
}

const getActiveChannels = (pkg, channelNames, snapshot) =>
  channelNames.filter(n => {
    const ch = channelRegistry[n]
    return ch && ch.transport !== false && (!snapshot || ch.snapshot) && ch.when(pkg)
  })

export const buildContext = (packages, queue, sha, {channelNames = [], snapshot = false} = {}) => {
  const pkgs = {}
  for (const name of queue) {
    const pkg = packages[name]
    if (!pkg.releaseType || pkg.skipped) continue
    pkgs[name] = {
      version:  pkg.version,
      tag:      pkg.tag,
      channels: getActiveChannels(pkg, channelNames, snapshot),
    }
  }

  return {
    status: 'proceed',
    sha,
    sha7: sha.slice(0, 7),
    packages: pkgs,
  }
}
