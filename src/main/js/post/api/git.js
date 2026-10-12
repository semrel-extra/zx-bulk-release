import {$, fs, path, tempy, copy} from 'zx-extra'
import {log} from '../log.js'
import {attempt3, keyedQueue, memoizeBy} from '../../util.js'

export const DEFAULT_GIT_COMMITTER_NAME  = 'Semrel Extra Bot'
export const DEFAULT_GIT_COMMITTER_EMAIL = 'semrel-extra-bot@hotmail.com'

// One writer per local repo: commands that write .git run one at a time per repo root.
// Locked operations never call each other.
const lock = keyedQueue()
const exclusive = async (cwd, fn) => lock(await getRoot(cwd), fn)

// The release identity as env, so zbr never writes repo config. Identity vars the env already sets win,
// as they did over the repo config zbr used to write.
export const identity = (_name, _email) => {
  const name  = _name  || $.env.GIT_COMMITTER_NAME  || DEFAULT_GIT_COMMITTER_NAME
  const email = _email || $.env.GIT_COMMITTER_EMAIL || DEFAULT_GIT_COMMITTER_EMAIL
  return {GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, ...$.env}
}

export const fetchRepo = memoizeBy(async ({cwd: _cwd, branch, origin: _origin, basicAuth}) => {
  if (!_origin && !_cwd) throw new Error('fetchRepo requires either origin or cwd')
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
}, async ({cwd, branch, origin}) => origin ? `${origin}:${branch}` : `${await getRoot(cwd)}:${branch}`)

// Each attempt is a fresh read-modify-write on top of the remote tip, so a failed one leaves nothing behind.
// files[].contents: string | object (as JSON) | (prev: string) => string
export const pushCommit = async ({cwd, from, to = '.', branch, origin, msg, ignoreFiles, files = [], basicAuth, gitCommitterEmail, gitCommitterName}) => {
  const _cwd = await fetchRepo({cwd, branch, origin, basicAuth})
  const _$ = $({cwd: _cwd, env: identity(gitCommitterName, gitCommitterEmail)})

  return exclusive(_cwd, () => attempt3(async () => {
    await resetBranch(_cwd, branch)
    for (const {relpath, contents} of files) {
      const file = path.resolve(_cwd, to, relpath)
      const value = typeof contents === 'function' ? contents(await fs.readFile(file, 'utf8').catch(() => '')) : contents
      await fs.outputFile(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    }
    if (from) await copy({baseFrom: cwd, from, baseTo: _cwd, to, ignoreFiles, cwd})

    await _$`git add .`
    if ((await $({cwd: _cwd, nothrow: true})`git diff --cached --quiet`).exitCode === 0) {
      log.warn(`no changes to commit to ${branch}`)
      return 'unchanged'
    }
    await _$`git commit -m ${msg}`
    await _$`git push origin HEAD:refs/heads/${branch}`
    return 'ok'
  }, (e) => log.warn('git push failed, retrying', 'branch', branch, e)))
}

// The remote tip of the branch, or an empty unborn one if there is none yet. Pushes are never forced,
// so taking a failed fetch for a new branch can only lead to a rejected push.
const resetBranch = async (cwd, branch) => {
  const _$ = $({cwd})
  const fetched = (await $({cwd, nothrow: true})`git fetch --depth 1 origin ${branch}`).exitCode === 0
  await (fetched ? _$`git reset -q --hard FETCH_HEAD` : _$`git update-ref -d HEAD && git read-tree --empty`)
  await _$`git clean -fdqx`
}

export const getRoot = memoizeBy(async (cwd) => (await $({cwd})`git rev-parse --show-toplevel`).toString().trim())

// The repo around cwd, or a fresh one bound to origin when there is no checkout.
export const openRepo = async (cwd, origin) => {
  const found = await $({cwd, quiet: true, nothrow: true})`git rev-parse --show-toplevel`
  if (found.exitCode === 0) return found.toString().trim()

  const dir = tempy.temporaryDirectory()
  await $({cwd: dir})`git init -q && git remote add origin ${origin}`
  log.info('no checkout: delivering from a fresh repo')
  return dir
}

export const getSha = memoizeBy(async (cwd) => (await $({cwd})`git rev-parse HEAD`).toString().trim(), getRoot)

export const getCommitTimestamp = memoizeBy(async (cwd) => (await $({cwd})`git log -1 --format=%ct`).toString().trim(), getRoot)

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

export const fetchTags = (cwd) => exclusive(cwd, async () => {
  await $({cwd})`git fetch origin --tags --force`
  clearTagsCache()
})

export const deepen = (cwd, depth) => exclusive(cwd, () =>
  $({cwd})`git fetch origin --deepen=${depth}`
)

export const isAncestor = async (cwd, ancestor, descendant) => {
  const res = await $({cwd, nothrow: true})`git merge-base --is-ancestor ${ancestor} ${descendant}`
  if (res.exitCode !== 0 && res.exitCode !== 1) throw res
  return res.exitCode === 0
}

// Claims a tag for a commit. The outcome is read from the remote, not from the error text:
// {pushed: true} — the tag is ours now; {pushed: false, commit} — it already exists and points to `commit`.
export const pushTag = ({cwd, tag, sha, message = tag, gitCommitterName, gitCommitterEmail}) => exclusive(cwd, async () => {
  await ensureCommit(cwd, sha)
  await $({cwd, env: identity(gitCommitterName, gitCommitterEmail)})`git tag -f -a -m ${message} ${tag} ${sha}`
  const push = await $({cwd, nothrow: true})`git push origin refs/tags/${tag}`
  if (push.exitCode === 0) return {pushed: true, commit: sha}

  const commit = await getRemoteTagCommit(cwd, tag)
  if (!commit) throw push // rejected by a hook or a ruleset, no access, no network
  return {pushed: false, commit}
})

// A tag target must be local: fetch the commit itself, not whatever the branch tips are now.
const ensureCommit = async (cwd, sha) => {
  if ((await $({cwd, nothrow: true, quiet: true})`git cat-file -e ${sha}^{commit}`).exitCode === 0) return
  await $({cwd})`git fetch --depth=1 origin ${sha}`
}

export const listRemoteTags = async (cwd) =>
  (await $({cwd})`git ls-remote --tags --refs origin`).toString()
    .split('\n').filter(Boolean).map(line => line.split('\t')[1].slice('refs/tags/'.length))

// The commit a remote tag points to (peeled), or null if the tag is absent or the remote is unreachable.
export const getRemoteTagCommit = async (cwd, tag) => {
  const ref = `refs/tags/${tag}`
  const refs = Object.fromEntries((await $({cwd, nothrow: true})`git ls-remote origin ${ref} ${ref}^{}`)
    .toString().split('\n').filter(Boolean).map(line => line.split('\t').reverse()))
  return refs[`${ref}^{}`] || refs[ref] || null
}

export const deleteRemoteTag = async (cwd, tag) =>
  $({cwd, nothrow: true})`git push origin :refs/tags/${tag}`

export const clearTagsCache = () => { $.memo?.delete?.(getTags) }
