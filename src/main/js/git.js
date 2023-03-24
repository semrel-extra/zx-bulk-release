import {$, ctx, fs, path, tempy, copy} from 'zx-extra'
import {log} from './log.js'
import {keyByValue} from './util.js'

const branches = {}
export const fetchRepo = async ({cwd: _cwd, branch, origin: _origin, basicAuth}) => ctx(async ($) => {
  const root = await getRoot(_cwd)
  const id = `${root}:${branch}`

  if (branches[id]) return branches[id]

  const origin = _origin || (await getRepo(_cwd, {basicAuth})).repoAuthedUrl
  const cwd = tempy.temporaryDirectory()
  $.cwd = cwd
  try {
    await $`git clone --single-branch --branch ${branch} --depth 1 ${origin} .`
  } catch (e) {
    log({level: 'warn'})(`ref '${branch}' does not exist in ${origin}`)
    await $`git init .`
    await $`git remote add origin ${origin}`
  }
  branches[id] = cwd

  return branches[id]
})

export const pushCommit = async ({cwd, from, to, branch, origin, msg, ignoreFiles, files = [], basicAuth, gitCommitterEmail, gitCommitterName}) => ctx(async ($) => {
  let retries = 3
  let _cwd

  while (retries > 0) {
    try {
      _cwd = await fetchRepo({cwd, branch, origin, basicAuth})

      for (let {relpath, contents} of files) {
        const _contents = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
        await fs.outputFile(path.resolve(_cwd, to, relpath), _contents)
      }
      if (from) await copy({baseFrom: cwd, from, baseTo: _cwd, to, ignoreFiles, cwd})

      $.cwd = _cwd

      await $`git config user.name ${gitCommitterName}`
      await $`git config user.email ${gitCommitterEmail}`
      await $`git add .`
      try {
        await $`git commit -m ${msg}`
      } catch {
        log({level: 'warn'})(`no changes to commit to ${branch}`)
        return
      }

      return await $.raw`git push origin HEAD:refs/heads/${branch}`
    } catch (e) {
      retries -= 1
      log({level: 'error'})('git push failed', 'branch', branch, 'retries left', retries, e)
      branches[keyByValue(branches, _cwd)] = null

      if (retries === 0) {
        throw e
      }
    }
  }
})

const repos = {}
export const getRepo = async (_cwd, {basicAuth} = {}) => {
  const cwd = await getRoot(_cwd)
  if (repos[cwd]) return repos[cwd]

  const e = new Error()
  console.log('!!! has basic auth', !!basicAuth, e.stack)

  const originUrl = await getOrigin(cwd)
  const [, , repoHost, repoName] = originUrl.replace(':', '/').replace(/\.git/, '').match(/.+(@|\/\/)([^/]+)\/(.+)$/) || []
  const repoPublicUrl = `https://${repoHost}/${repoName}`
  const repoAuthedUrl = basicAuth && repoHost && repoName
    ? `https://${basicAuth}@${repoHost}/${repoName}.git`
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

export const getSha = async (cwd) => (await $.o({cwd})`git rev-parse HEAD`).toString().trim()

export const getCommits = async (cwd, from, to = 'HEAD') => ctx(async ($) => {
  const ref = from ? `${from}..${to}` : to

  $.cwd = cwd
  return (await $.raw`git log ${ref} --format=+++%s__%b__%h__%H -- .`)
    .toString()
    .split('+++')
    .filter(Boolean)
    .map(msg => {
      const [subj, body, short, hash] = msg.split('__').map(raw => raw.trim())
      return {subj, body, short, hash}
    })
})

export const getTags = async (cwd, ref = '') =>
  (await $.o({cwd})`git tag -l ${ref}`)
    .toString()
    .split('\n')
