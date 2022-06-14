import {ctx, fs, path, tempy, $, sleep} from 'zx-extra'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const fixtures = path.resolve(__dirname, '../fixtures')

export const createNpmRegistry = () => {
  let p

  return {
    address: 'http://localhost:4873/',
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
      return p?.kill()
    }
  }
}

export const createFakeRepo = async ({cwd = tempy.temporaryDirectory(), commits = []} = {}) =>
  ctx(async ($) => {
    $.cwd = cwd
    await $`git init`

    for (let {msg, files, name = 'Semrel-extra Bot', email = 'semrel-extra-bot@hotmail.com', tags = []} of commits) {
      await $`git config user.name ${name}`
      await $`git config user.email ${email}`
      for (let {relpath, contents} of files) {
        const _contents = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
        await fs.outputFile(path.resolve(cwd, relpath), _contents)
      }
      await $`git add .`
      await $`git commit -m ${msg}`

      for (let tag of tags) {
        await $`git tag ${tag} -m ${tag}`
      }
    }

    return cwd
  })
