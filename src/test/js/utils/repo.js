import {fs, path, tempy, $, sleep} from 'zx-extra'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const fixtures = path.resolve(__dirname, '../../fixtures')

export const createNpmRegistry = () => {
  let p, exited

  return {
    address: $.env.NPM_REGISTRY || 'http://localhost:4873',
    async start() {
      fs.removeSync(path.resolve(__dirname, '../../../../storage'))
      const config = path.resolve(__dirname, '../../../../verdaccio.config.yaml')
      exited = false
      p = $({preferLocal: true, nothrow: true})`verdaccio --config ${config}`
      p.then(() => { exited = true })

      await sleep(1000)
      // e.g. the port is still taken by a registry from another run
      if (exited) throw new Error(`verdaccio exited: ${await p}`)
    },
    async stop() {
      if (exited) return
      await p.kill() // signals the whole process tree, verdaccio included
      await p
    }
  }
}

export const createFakeRepo = async ({cwd = tempy.temporaryDirectory(), commits = []} = {}) => {
  const _$ = $({cwd})
  await _$`git init`

  await addCommits({cwd, commits})

  const bare = tempy.temporaryDirectory()
  await _$`git init --bare ${bare}`
  await _$`git remote add origin ${bare}`

  return cwd
}

export const addCommits = async ({cwd, commits = []}) => {
  const _$ = $({cwd})

  for (let {msg, files, name = 'Semrel-extra Bot', email = 'semrel-extra-bot@hotmail.com', tags = []} of commits) {
    await _$`git config user.name ${name}`
    await _$`git config user.email ${email}`
    for (let {relpath, contents} of files) {
      const _contents = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
      const file = path.resolve(cwd, relpath)
      await fs.outputFile(file, _contents)

      await _$`git add ${file}`
    }

    await _$`git commit -m ${msg}`

    for (let tag of tags) {
      await _$`git tag ${tag} -m ${tag}`
    }
  }
}
