import {$, ctx, fs, path, tempy} from 'zx-extra'
import {parseEnv} from './config.js'
import {copydir} from 'git-glob-cp'

const branches = {}
export const fetch = async ({cwd: _cwd, branch, origin: _origin}) => ctx(async ($) => {
  const root = await getRoot(_cwd)
  const id = `${root}:${branch}`

  if (branches[id]) return branches[id]

  const origin = _origin || (await parseRepo(_cwd)).repoAuthedUrl
  const cwd = tempy.temporaryDirectory()
  $.cwd = cwd
  try {
    await $`git clone --single-branch --branch ${branch} --depth 1 ${origin} .`
  } catch (e) {
    console.warn(`ref ${branch} does not exist in ${origin}`)
    await $`git init .`
    await $`git remote add origin ${origin}`
  }
  branches[id] = cwd

  return branches[id]
})

export const push = async ({cwd, from, to, branch, origin, msg, ignoreFiles, files = []}) => ctx(async ($) => {
  const _cwd = await fetch({cwd, branch, origin})
  const {gitCommitterEmail, gitCommitterName} = parseEnv($.env)

  for (let {relpath, contents} of files) {
    const _contents = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
    await fs.outputFile(path.resolve(_cwd, to, relpath), _contents)
  }
  if (from) await copydir({baseFrom: cwd, from, baseTo: _cwd, to, ignoreFiles, cwd})

  $.cwd = _cwd

  await $`git config user.name ${gitCommitterEmail}`
  await $`git config user.email ${gitCommitterName}`
  await $`git add .`
  try {
    await $`git commit -m ${msg}`
  } catch {
    console.warn(`no changes to commit to ${branch}`)
    return
  }

  await $.raw`git push origin HEAD:refs/heads/${branch}`
})

const repos = {}
export const parseRepo = async (_cwd) => {
  const cwd = await getRoot(_cwd)
  if (repos[cwd]) return repos[cwd]

  const {ghToken, ghUser} = parseEnv($.env)
  const originUrl = await getOrigin(cwd)
  const [, , repoHost, repoName] = originUrl.replace(':', '/').replace(/\.git/, '').match(/.+(@|\/\/)([^/]+)\/(.+)$/) || []
  const repoPublicUrl = `https://${repoHost}/${repoName}`
  const repoAuthedUrl = ghToken && ghUser && repoHost && repoName ?
    `https://${ghUser}:${ghToken}@${repoHost}/${repoName}`
    : originUrl

  repos[cwd] = {
    repoName,
    repoHost,
    repoPublicUrl,
    repoAuthedUrl,
    originUrl,
  }

  return repos[cwd]
}

const origins = {}
export const getOrigin = async (cwd) => {
  if (!origins[cwd]) {
    origins[cwd] = (await $.o({cwd})`git config --get remote.origin.url`).toString().trim()
  }

  return origins[cwd]
}

export const getRoot = async (cwd) => (await $.o({cwd})`git rev-parse --show-toplevel`).toString().trim()
