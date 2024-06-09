import {queuefy} from 'queuefy'
import {$, path, tempy, glob, fs, fetch} from 'zx-extra'
import {log} from '../log.js'
import {getRepo, pushCommit} from './git.js'
import {formatTag} from '../processor/meta.js'
import {formatReleaseNotes} from './changelog.js'
import {asArray, getCommonPath, msgJoin} from '../util.js'

// https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#create-a-release
export const ghRelease = async (pkg) => {
  const {ghBasicAuth: basicAuth, ghToken, ghAssets} = pkg.config
  if (!ghToken) return null

  log({pkg})('create gh release')

  const now = Date.now()
  const {name, version, absPath: cwd, tag = formatTag({name, version})} = pkg
  const {repoName} = await getRepo(cwd, {basicAuth})
  const releaseNotes = await formatReleaseNotes(pkg)
  const releaseData = JSON.stringify({
    name: tag,
    tag_name: tag,
    body: releaseNotes
  })

  const res = await (await fetch(`https://api.github.com/repos/${repoName}/releases`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${ghToken}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: releaseData
  })).json()

  if (!res.upload_url) {
    throw new Error(`gh release failed: ${JSON.stringify(res)}`)
  }

  if (ghAssets?.length) {
    // Lol. GH API literally returns pseudourl `...releases/110103594/assets{?name,label}` as shown in the docs
    const uploadUrl = res.upload_url.slice(0, res.upload_url.indexOf('{'))
    await ghUploadAssets({ghToken, ghAssets, uploadUrl, cwd})
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

  await Promise.all(assets.map(async ({name, contents, source = 'target/**/*', zip, cwd = _cwd, strip = true}) => {
    const target = path.join(temp, name)

    if (contents) {
      await fs.outputFile(target, contents, 'utf8')
      return
    }

    const patterns = asArray(source)
    if (patterns.some(s => s.includes('*'))) {
      zip = true
    }
    const files = await glob(patterns, {cwd, absolute: false, onlyFiles: true})

    if (files.length === 0) {
      throw new Error(`gh asset not found: ${name} ${source}`)
    }

    if (!zip && files.length === 1) {
      await fs.copy(path.join(cwd, files[0]), target)
      return
    }
    const prefix = getCommonPath(files)

    return $.raw`tar -C ${path.join(cwd, prefix)} -cv${zip ? 'z' : ''}f ${target} ${files.map(f => f.slice(prefix.length)).join(' ')}`
  }))

  return temp
}

export const ghUploadAssets = async ({ghToken, ghAssets, uploadUrl, cwd}) => {
  const temp = await ghPrepareAssets(ghAssets, cwd)

  return Promise.all(ghAssets.map(async ({name}) => {
    const url = `${uploadUrl}?name=${name}`
    // return $.o({cwd: temp})`curl -H 'Authorization: token ${ghToken}' -H 'Accept: application/vnd.github.v3+json' -H 'Content-Type: application/octet-stream' ${url} --data-binary '@${name}'`
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${ghToken}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: await fs.readFile(path.join(temp, name))
    })
  }))
}

export const ghGetAsset = async ({repoName, tag, name}) => {
  return (await fetch(`https://github.com/${repoName}/releases/download/${tag}/${name}`, {
    headers: {
      // Accept: 'application/vnd.github.v3+json'
    }
  })).text()
}
