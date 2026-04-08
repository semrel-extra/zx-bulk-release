import {$} from 'zx-extra'
import {queuefy} from 'queuefy'
import {fetchRepo, pushCommit} from '../api/git.js'
import {formatReleaseNotes} from '../processor/notes.js'
import {log} from '../log.js'
import {asTuple, msgJoin} from '../util.js'

export const pushChangelog = queuefy(async (pkg) => {
  const {absPath: cwd, config: {changelog: opts, gitCommitterEmail, gitCommitterName, ghBasicAuth: basicAuth}} = pkg
  if (!opts) return

  log({pkg})('push changelog')
  const [branch = 'changelog', file = `${pkg.name.replace(/[^a-z0-9-]/ig, '')}-changelog.md`, ..._msg] = asTuple(opts, ['branch', 'file', 'msg'])
  const _cwd = await fetchRepo({cwd, branch, basicAuth})
  const msg = msgJoin(_msg, pkg, 'chore: update changelog ${{name}}')
  const releaseNotes = await formatReleaseNotes(pkg)

  await $({cwd: _cwd})`echo ${releaseNotes}"\n$(cat ./${file})" > ./${file}`
  await pushCommit({cwd, branch, msg, gitCommitterEmail, gitCommitterName, basicAuth})
})
