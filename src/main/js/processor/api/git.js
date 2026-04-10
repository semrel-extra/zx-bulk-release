import {$, fs, path, tempy, copy} from 'zx-extra'
import {log} from '../log.js'
import {attempt2, attempt3, memoizeBy} from '../../util.js'

export const fetchRepo = memoizeBy(async ({cwd: _cwd, branch, origin: _origin, basicAuth}) => {
  const origin = _origin || (await getRepo(_cwd, {basicAuth})).repoAuthedUrl
  const cwd = tempy.temporaryDirectory()
  const _$ = $({cwd})
  try {
    await _$`git clone --single-branch --branch ${branch} --depth 1 ${origin} .`
  } catch (e) {
    log.warn(`ref '${branch}' does not exist in ${origin}`)
    await _$`git init . &&
            git remote add origin ${origin}`
  }

  return cwd
}, async ({cwd, branch}) => `${await getRoot(cwd)}:${branch}`)

export const pushCommit = async ({cwd, from, to, branch, origin, msg, ignoreFiles, files = [], basicAuth, gitCommitterEmail, gitCommitterName}) => {
  const _cwd = await fetchRepo({cwd, branch, origin, basicAuth})
  const _$ = $({cwd: _cwd})

  for (let {relpath, contents} of files) {
    const _contents = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
    await fs.outputFile(path.resolve(_cwd, to, relpath), _contents)
  }
  if (from) await copy({baseFrom: cwd, from, baseTo: _cwd, to, ignoreFiles, cwd})

  try {
    await setUserConfig(_cwd, gitCommitterName, gitCommitterEmail)
    await _$`git add . &&
            git commit -m ${msg}`
  } catch {
    log.warn(`no changes to commit to ${branch}`)
    return
  }

  return attempt3(
    () => _$`git push origin HEAD:refs/heads/${branch}`,
    (e) => {
      log.warn('git push failed, rebasing', 'branch', branch, e)
      return attempt2(() => _$`git fetch origin ${branch} &&
              git rebase origin/${branch}`)
    }
  )
}

export const getRoot = memoizeBy(async (cwd) => (await $({cwd})`git rev-parse --show-toplevel`).toString().trim())

export const getSha = memoizeBy(async (cwd) => (await $({cwd})`git rev-parse HEAD`).toString().trim(), getRoot)

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
  $({cwd})`git config --get remote.origin.url`.then(r => r.toString().trim())
)

export const getCommits = async (cwd, from, to = 'HEAD') => {
  const _$ = $({cwd})

  const _from = from || await _$`git rev-list --max-parents=0 HEAD`
  const ref = `${_from}..${to}`

  return (await _$`git log ${ref} --format=+++%s__%b__%h__%H -- ${cwd}`)
    .toString()
    .split('+++')
    .filter(Boolean)
    .map(msg => {
      const [subj, body, short, hash] = msg.split('__').map(raw => raw.trim())
      return {subj, body, short, hash}
    })
}

export const getTags = memoizeBy(
  async (cwd, ref = '*') => (await $({cwd})`git tag -l ${ref}`).toString().split('\n'),
  async (cwd, ref = '*') => `${await getRoot(cwd)}:${ref}`,
)

export const pushTag = async ({cwd, tag, gitCommitterName, gitCommitterEmail}) => {
  await setUserConfig(cwd, gitCommitterName, gitCommitterEmail)

  await $({cwd})`
    git tag -m ${tag} ${tag} &&
    git push origin ${tag}`
}

export const fetchTags = async (cwd) =>
  $({cwd})`git fetch --tags`

export const deleteRemoteTag = async ({cwd, tag}) => {
  log.info(`rolling back remote tag '${tag}'`)
  await $({cwd, nothrow: true})`git push origin :refs/tags/${tag}`
  await $({cwd, nothrow: true})`git tag -d ${tag}`
}

// Memoize prevents .git/config lock
// https://github.com/qiwi/packasso/actions/runs/4539987310/jobs/8000403413#step:7:282
export const setUserConfig = memoizeBy(async(cwd, gitCommitterName, gitCommitterEmail) => $({cwd})`
  git config user.name ${gitCommitterName} &&
  git config user.email ${gitCommitterEmail}
`)

export const unsetUserConfig = async(cwd) => $({cwd, nothrow: true})`
  git config --unset user.name &&
  git config --unset user.email`
