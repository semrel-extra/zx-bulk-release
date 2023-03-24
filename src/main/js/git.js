import {$, ctx, fs, path, tempy, copy} from 'zx-extra'
import {log} from './log.js'
import {keyByValue, memoizeBy} from './util.js'

export const fetchRepo = memoizeBy(async ({cwd: _cwd, branch, origin: _origin, basicAuth}) => ctx(async ($) => {
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

  return cwd
}), async ({cwd, branch}) => `${await getRoot(cwd)}:${branch}`)

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

      if (retries === 0) {
        throw e
      }
    }
  }
})

export const getRoot = async (cwd) => (await $.o({cwd})`git rev-parse --show-toplevel`).toString().trim()

export const getSha = async (cwd) => (await $.o({cwd})`git rev-parse HEAD`).toString().trim()

export const getRepo = memoizeBy(async (cwd, {basicAuth} = {}) => {
  const originUrl = await getOrigin(cwd)
  const [, , repoHost, repoName] = originUrl.replace(':', '/').replace(/\.git/, '').match(/.+(@|\/\/)([^/]+)\/(.+)$/) || []
  const repoPublicUrl = `https://${repoHost}/${repoName}`
  const repoAuthedUrl = basicAuth && repoHost && repoName
    ? `https://${basicAuth}@${repoHost}/${repoName}.git`
    : originUrl

  return {
    repoName,
    repoHost,
    repoPublicUrl,
    repoAuthedUrl,
    originUrl,
  }
}, getRoot)

export const getOrigin = memoizeBy(async (cwd) =>
  $.o({cwd})`git config --get remote.origin.url`.then(r => r.toString().trim())
)

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
