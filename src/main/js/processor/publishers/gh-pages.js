import {queuefy} from 'queuefy'
import {path} from 'zx-extra'
import {log} from '../log.js'
import {pushCommit} from '../api/git.js'
import {asTuple, msgJoin} from '../../util.js'

const run = queuefy(async (pkg) => {
  const {config: {ghPages: opts, gitCommitterEmail, gitCommitterName, ghBasicAuth: basicAuth}} = pkg
  if (!opts) return

  const [branch = 'gh-pages', from = 'docs', to = '.', ..._msg] = asTuple(opts, ['branch', 'from', 'to', 'msg'])
  const msg = msgJoin(_msg, pkg, 'docs: update docs ${{name}} ${{version}}')

  log.info(`publish docs to ${branch}`)

  await pushCommit({
    cwd: path.join(pkg.absPath, from),
    from: '.',
    to,
    branch,
    msg,
    gitCommitterEmail,
    gitCommitterName,
    basicAuth,
  })
})

export default {
  name: 'gh-pages',
  when: (pkg) => !!pkg.config.ghPages,
  run,
}
