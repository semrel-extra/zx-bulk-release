import {log} from '../log.js'
import {getRepo, getRoot} from '../api/git.js'
import {ghCreateRelease, ghDeleteReleaseByTag, ghUploadAssets} from '../api/gh.js'
import {formatTag} from '../generators/tag.js'
import {formatReleaseNotes} from '../generators/notes.js'

const run = async (pkg) => {
  const {ghBasicAuth: basicAuth, ghToken, ghAssets, ghApiUrl} = pkg.config
  if (!ghToken) return null

  log.info('create gh release')

  const now = Date.now()
  const {name, version, absPath: cwd, tag = formatTag({name, version})} = pkg
  const {repoName} = await getRepo(cwd, {basicAuth})
  const body = await formatReleaseNotes(pkg)
  const res = await ghCreateRelease({ghApiUrl, ghToken, repoName, tag, body})

  if (ghAssets?.length) {
    // GH API returns a pseudo-url `...releases/110103594/assets{?name,label}` — strip the template.
    const uploadUrl = res.upload_url.slice(0, res.upload_url.indexOf('{'))
    await ghUploadAssets({ghToken, ghAssets, uploadUrl, cwd})
  }

  log.info(`duration gh release: ${Date.now() - now}`)
}

const undo = async (pkg, {tag}) => {
  const {ghBasicAuth: basicAuth, ghToken, ghApiUrl} = pkg.config
  if (!ghToken) return
  const cwd = await getRoot(pkg.absPath)
  const {repoName} = await getRepo(cwd, {basicAuth})
  await ghDeleteReleaseByTag({ghApiUrl, ghToken, repoName, tag})
}

export default {
  name: 'gh-release',
  when: (pkg) => !!pkg.config.ghToken,
  run,
  undo,
}
