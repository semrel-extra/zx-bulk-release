import {fs, path} from 'zx-extra'
import {log} from '../../processor/log.js'
import {getRepo, getRoot} from '../../processor/api/git.js'
import {ghCreateRelease, ghDeleteReleaseByTag, ghFetch} from '../../processor/api/gh.js'

const run = async (data) => {
  const {tag, token, apiUrl, repoName, releaseNotes, assets, assetsDir} = data
  if (!token) return null

  log.info('create gh release')
  const now = Date.now()

  const res = await ghCreateRelease({ghApiUrl: apiUrl, ghToken: token, repoName, tag, body: releaseNotes})

  if (assets?.length) {
    const uploadUrl = res.upload_url.slice(0, res.upload_url.indexOf('{'))
    if (assetsDir) {
      await Promise.all(assets.map(async ({name}) => {
        const url = `${uploadUrl}?name=${name}`
        const body = await fs.readFile(path.join(assetsDir, name))
        const r = await ghFetch(url, {ghToken: token, method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body})
        if (!r.ok) throw new Error(`gh asset upload failed for '${name}': ${r.status}`)
      }))
    } else {
      const {ghUploadAssets} = await import('../../processor/api/gh.js')
      await ghUploadAssets({ghToken: token, ghAssets: assets, uploadUrl, cwd: data.gitRoot})
    }
  }

  log.info(`duration gh release: ${Date.now() - now}`)
}

const undo = async (pkg, {tag}) => {
  const {ghBasicAuth: basicAuth, ghToken, ghApiUrl} = pkg.config
  if (!ghToken) return
  const repoName = pkg.repoName || (await getRepo(await getRoot(pkg.absPath), {basicAuth})).repoName
  await ghDeleteReleaseByTag({ghApiUrl, ghToken, repoName, tag})
}

export default {
  name: 'gh-release',
  when: (pkg) => !!pkg.config.ghToken,
  run,
  undo,
}
