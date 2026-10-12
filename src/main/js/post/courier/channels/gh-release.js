import {fs, path} from 'zx-extra'
import {log} from '../../log.js'
import {api} from '../../api/index.js'

// Only a release that already exists for the tag is a duplicate; any other validation error is a failure.
const isDuplicate = (e) => /already_exists/.test(e?.message || '')

const run = async (manifest, dir) => {
  const {tag, token, apiUrl, repoName, releaseNotes, assets} = manifest

  log.info('create gh release')
  const now = Date.now()

  let res
  try {
    res = await api.gh.ghCreateRelease({ghApiUrl: apiUrl, ghToken: token, repoName, tag, body: releaseNotes})
  } catch (e) {
    if (isDuplicate(e)) return 'duplicate'
    throw e
  }

  if (assets?.length) {
    const uploadUrl = res.upload_url.slice(0, res.upload_url.indexOf('{'))
    const assetsDir = path.join(dir, 'assets')
    if (await fs.pathExists(assetsDir)) {
      await Promise.all(assets.map(async ({name}) => {
        const url = `${uploadUrl}?name=${name}`
        const body = await fs.readFile(path.join(assetsDir, name))
        const r = await api.gh.ghFetch(url, {ghToken: token, method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body})
        if (!r.ok) throw new Error(`gh asset upload failed for '${name}': ${r.status}`)
      }))
    }
  }

  log.info(`duration gh release: ${Date.now() - now}`)
  return 'ok'
}

export default {
  name: 'gh-release',
  stage: 'announce',
  requires: ['token', 'repoName'],
  when: (pkg) => !!pkg.config.ghToken,
  run,
}
