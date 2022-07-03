import {ctx, fs, path, tempy, $, sleep} from 'zx-extra'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const fixtures = path.resolve(__dirname, '../fixtures')

export const createNpmRegistry = () => {
  let p

  return {
    address: $.env.NPM_REGISTRY,
    async start() {
      fs.removeSync(path.resolve(__dirname, '../../../storage'))
      const config = path.resolve(__dirname, '../../../verdaccio.config.yaml')
      ctx(($) => {
        $.preferLocal = true
        p = $`verdaccio --config ${config}`
      })

      return sleep(1000)
    },
    async stop() {
      p._nothrow = true
      return p?.kill()
    }
  }
}

export const createFakeRepo = async ({cwd = tempy.temporaryDirectory(), commits = []} = {}) =>
  ctx(async ($) => {
    $.cwd = cwd
    await $`git init`

    await addCommits({cwd, commits})

    const bare = tempy.temporaryDirectory()
    await $`git init --bare ${bare}`
    await $`git remote add origin ${bare}`

    return cwd
  })

export const addCommits = async ({cwd, commits = []}) => ctx(async ($) => {
  $.cwd = cwd

  for (let {msg, files, name = 'Semrel-extra Bot', email = 'semrel-extra-bot@hotmail.com', tags = []} of commits) {
    await $`git config user.name ${name}`
    await $`git config user.email ${email}`
    for (let {relpath, contents} of files) {
      const _contents = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
      const file = path.resolve(cwd, relpath)
      await fs.outputFile(file, _contents)

      await $`git add ${file}`
    }

    await $`git commit -m ${msg}`

    for (let tag of tags) {
      await $`git tag ${tag} -m ${tag}`
    }
  }
})
