import {$, ctx, fs, path, tempy, copy} from 'zx-extra'
import {log} from '../log.js'
import {memoizeBy} from '../util.js'

export const fetchRepo = memoizeBy(async ({cwd: _cwd, branch, origin: _origin, basicAuth}) => ctx(async ($) => {
  const origin = _origin || (await getRepo(_cwd, {basicAuth})).repoAuthedUrl
  const cwd = tempy.temporaryDirectory()
  $.cwd = cwd
  try {
    await $`git clone --single-branch --branch ${branch} --depth 1 ${origin} .`
  } catch (e) {
    log({level: 'warn'})(`ref '${branch}' does not exist in ${origin}`)
    await $`git init . &&
            git remote add origin ${origin}`
  }

  return cwd
}), async ({cwd, branch}) => `${await getRoot(cwd)}:${branch}`)

export const pushCommit = async ({cwd, from, to, branch, origin, msg, ignoreFiles, files = [], basicAuth, gitCommitterEmail, gitCommitterName}) => ctx(async ($) => {
  let retries = 3

  const _cwd = await fetchRepo({cwd, branch, origin, basicAuth})
  $.cwd = _cwd

  for (let {relpath, contents} of files) {
    const _contents = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
    await fs.outputFile(path.resolve(_cwd, to, relpath), _contents)
  }
  if (from) await copy({baseFrom: cwd, from, baseTo: _cwd, to, ignoreFiles, cwd})

  try {
    await setUserConfig(_cwd, gitCommitterName, gitCommitterEmail)
    await $`git add . &&
            git commit -m ${msg}`
  } catch {
    log({level: 'warn'})(`no changes to commit to ${branch}`)
    return
  }

  while (retries > 0) {
    try {
      return await $.raw`git push origin HEAD:refs/heads/${branch}`
    } catch (e) {
      retries -= 1
      log({level: 'error'})('git push failed', 'branch', branch, 'retries left', retries, e)

      if (retries === 0) {
        throw e
      }

      await $`git fetch origin ${branch} &&
              git rebase origin/${branch}`
    }
  }
})

export const getSha = async (cwd) => (await $.o({cwd})`git rev-parse HEAD`).toString().trim()

export const getRoot = memoizeBy(async (cwd) => (await $.o({cwd})`git rev-parse --show-toplevel`).toString().trim())

export const parseOrigin = (originUrl) => {
  const [, , repoHost, repoName] = originUrl.replace(':', '/').replace(/\.git/, '').match(/.+(@|\/\/)([^/]+)\/(.+)$/) || []

  return {repoHost, repoName}
}

export const getRepo = memoizeBy(async (cwd, {basicAuth} = {}) => {
  const originUrl = await getOrigin(cwd)
  const {repoHost, repoName} = parseOrigin(originUrl)
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
  $.cwd = cwd

  const _from = from || await $`git rev-list --max-parents=0 HEAD`
  const ref = `${_from}..${to}`

  return (await $.raw`git log ${ref} --format=+++%s__%b__%h__%H -- ${cwd}`)
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

export const pushTag = async ({cwd, tag, gitCommitterName, gitCommitterEmail}) => {
  await setUserConfig(cwd, gitCommitterName, gitCommitterEmail)
  await $.o({cwd})`
    git tag -m ${tag} ${tag} &&
    git push origin ${tag}`
}

// Memoize prevents .git/config lock
// https://github.com/qiwi/packasso/actions/runs/4539987310/jobs/8000403413#step:7:282
export const setUserConfig = memoizeBy(async(cwd, gitCommitterName, gitCommitterEmail) => $.o({cwd})`
  git config user.name ${gitCommitterName} &&
  git config user.email ${gitCommitterEmail}
`)

export const unsetUserConfig = async(cwd) => $.o({cwd, nothrow: true})`
  git config --unset user.name &&
  git config --unset user.email`
