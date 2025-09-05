import {fs, path, tempy, $, sleep} from 'zx-extra'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const fixtures = path.resolve(__dirname, '../fixtures')

export const createNpmRegistry = () => {
  let p

  return {
    address: $.env.NPM_REGISTRY || 'http://localhost:4873',
    async start() {
      fs.removeSync(path.resolve(__dirname, '../../../storage'))
      const config = path.resolve(__dirname, '../../../verdaccio.config.yaml')
      p = $({preferLocal: true})`verdaccio --config ${config}`

      return sleep(1000)
    },
    async stop() {
      p.nothrow().kill()
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
