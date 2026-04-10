// Low-level GitHub API primitives. No domain knowledge, no imports from processor/ or steps/.

import {$, path, tempy, glob, fs, fetch} from 'zx-extra'
import {asArray, attempt2} from '../../util.js'

export const getCommonPath = files => {
  const f0 = files[0]
  const common = files.length === 1
    ? f0.lastIndexOf('/') + 1
    : [...f0].findIndex((c, i) => files.some(f => f.charAt(i) !== c))
  const p = f0.slice(0, common)
  return p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1)
}

export const GH_API_VERSION = '2022-11-28'
export const GH_ACCEPT = 'application/vnd.github.v3+json'

export const ghFetch = (url, {ghToken, method = 'GET', headers, body} = {}) => fetch(url, {
  method,
  headers: {
    Accept: GH_ACCEPT,
    'X-GitHub-Api-Version': GH_API_VERSION,
    ...(ghToken ? {Authorization: `token ${ghToken}`} : {}),
    ...headers,
  },
  body,
})

// https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#create-a-release
export const ghCreateRelease = async ({ghApiUrl, ghToken, repoName, tag, body}) => {
  const res = await (await ghFetch(`${ghApiUrl}/repos/${repoName}/releases`, {
    ghToken,
    method: 'POST',
    body: JSON.stringify({name: tag, tag_name: tag, body}),
  })).json()

  if (!res.upload_url) {
    throw new Error(`gh release failed: ${JSON.stringify(res)}`)
  }
  return res
}

// https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28#delete-a-release
export const ghDeleteReleaseByTag = async ({ghApiUrl, ghToken, repoName, tag}) => {
  const res = await attempt2(() => ghFetch(`${ghApiUrl}/repos/${repoName}/releases/tags/${tag}`, {ghToken}))
  if (!res.ok) return false
  const {id} = await res.json()
  await attempt2(() => ghFetch(`${ghApiUrl}/repos/${repoName}/releases/${id}`, {ghToken, method: 'DELETE'}))
  return true
}

// https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28#upload-a-release-asset
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
    const res = await ghFetch(url, {
      ghToken,
      method: 'POST',
      headers: {'Content-Type': 'application/octet-stream'},
      body: await fs.readFile(path.join(temp, name)),
    })
    if (!res.ok) {
      throw new Error(`gh asset upload failed for '${name}': ${res.status}`)
    }
    return res
  }))
}

export const ghGetAsset = async ({repoName, tag, name, ghUrl}) => {
  const url = `${ghUrl || 'https://github.com'}/${repoName}/releases/download/${tag.ref || tag}/${name}`
  const res = await attempt2(() => fetch(url))
  if (!res.ok) {
    throw new Error(`gh asset fetch failed for '${name}': ${res.status} ${url}`)
  }
  return res.text()
}
