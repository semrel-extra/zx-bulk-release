import {queuefy} from 'queuefy'
import {$, path, tempy, glob, fs} from 'zx-extra'
import {log} from './log.js'
import {getRepo, pushCommit} from './git.js'
import {formatTag} from './meta.js'
import {formatReleaseNotes} from './changelog.js'
import {asArray, msgJoin} from './util.js'

// https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#create-a-release
export const ghRelease = async (pkg) => {
  const {ghBasicAuth: basicAuth, ghToken, ghAssets} = pkg.config
  if (!ghToken) return null

  log({pkg})('create gh release')

  const now = Date.now()
  const {name, version, absPath: cwd} = pkg
  const {repoName} = await getRepo(cwd, {basicAuth})
  const tag = formatTag({name, version})
  const releaseNotes = await formatReleaseNotes(pkg)
  const releaseData = JSON.stringify({
    name: tag,
    tag_name: tag,
    body: releaseNotes
  })

  const {stdout} = await $.o({cwd})`curl -H 'Authorization: token ${ghToken}' -H 'Accept: application/vnd.github.v3+json' https://api.github.com/repos/${repoName}/releases -d ${releaseData}`
  const res = JSON.parse(stdout.toString().trim())

  log({pkg})('gh release url:', res.url, res.html_url, res.upload_url)

  if (ghAssets) {
    await ghUploadAssets({ghToken, uploadUrl: res.upload_url, cwd})
  }

  log({pkg})(`duration gh release: ${Date.now() - now}`)
}

export const ghPages = queuefy(async (pkg) => {
  const {config: {ghPages: opts, gitCommitterEmail, gitCommitterName, ghBasicAuth: basicAuth}} = pkg
  if (!opts) return

  const [branch = 'gh-pages', from = 'docs', to = '.', ..._msg] = typeof opts === 'string'
    ? opts.split(' ')
    : [opts.branch, opts.from, opts.to, opts.msg]
  const msg = msgJoin(_msg, pkg, 'docs: update docs ${{name}} ${{version}}')

  log({pkg})(`publish docs to ${branch}`)

  await pushCommit({
    cwd: path.join(pkg.absPath, from),
    from: '.',
    to,
    branch,
    msg,
    gitCommitterEmail,
    gitCommitterName,
    basicAuth
  })
})

// https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28#upload-a-release-asset8
export const ghPrepareAssets = async (assets, _cwd) => {
  const temp = tempy.temporaryDirectory()

  await Promise.all(assets.map(async ({name, source = 'target/**/*', zip, cwd = _cwd}) => {
    const patterns = asArray(source)
    const target = path.join(temp, name)
    if (patterns.some(s => s.includes('*'))) {
      zip = true
    }
    const files = await glob(patterns, {cwd, absolute: true, onlyFiles: true})

    if (!zip && files.length === 1) {
      await fs.copy(files[0], target)
      return
    }

    return $.raw`tar -C ${cwd} -cv${zip ? 'z' : ''}f ${target} ${files.join(' ')}`
  }))

  return temp
}

export const ghUploadAssets = async ({ghToken, ghAssets, uploadUrl, cwd}) => {
  const temp = await ghPrepareAssets(ghAssets, cwd)

  return Promise.all(ghAssets.map(async ({name}) => {
    const url = `${uploadUrl}?name=${name}`
    return $.o({cwd: temp})`curl -H 'Authorization: token ${ghToken}' -H 'Accept: application/vnd.github.v3+json' -H 'Content-Type: application/octet-stream' ${url} --data-binary '@${name}'`
  }))
}

