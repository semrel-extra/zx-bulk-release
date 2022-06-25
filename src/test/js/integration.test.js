import {suite} from 'uvu'
import * as assert from 'uvu/assert'

import {ctx, tempy, fs, path, $} from 'zx-extra'
import {run} from '../../main/js/index.js'
import {formatTag} from '../../main/js/tag.js'
import {addCommits, createFakeRepo, createNpmRegistry, fixtures} from './test-utils.js'

const test = suite('integration')

try {

const cwd = await createFakeRepo({
  commits: [
    {
      msg: 'chore: initial commit',
      files: [
        {
          relpath: './README.md',
          contents: '#Readme'
        },
        {
          relpath: './package.json',
          contents: {
            name: 'root',
            workspaces: ['packages/*'],
            private: true,
            packageManager: 'yarn@4.0.0-rc.9'
          }
        },
        {
          relpath: '.yarnrc.yml',
          contents: 'yarnPath: .yarn/releases/yarn-4.0.0-rc.9.cjs'
        },
        {
          relpath: '.yarn/releases/yarn-4.0.0-rc.9.cjs',
          contents: fs.readFileSync(path.resolve(fixtures, 'regular-monorepo/.yarn/releases/yarn-4.0.0-rc.9.cjs'), 'utf8')
        }
      ]
    },
    {
      msg: 'feat: init pkg a',
      files: [
        {
          relpath: './packages/a/package.json',
          contents: {
            name: 'a',
            version: '0.0.1',
            scripts: {
              build: 'cp index.js bundle.js',
              test: "node ./index.js"
            },
            release: {
              build: true,
              fetch: true,
              test: true
            },
            exports: {
              '.': {
                import: './bundle.js'
              }
            },
            type: 'module'
          }
        },
        {
          relpath: './packages/a/index.js',
          contents: 'export const a = "a"'
        }
      ]
    },
    {
      msg: 'chore(a): some a update',
      files: [
        {
          relpath: './packages/a/foo.txt',
          contents: 'foo'
        }
      ]
    },
    {
      msg: 'chore(a): another a update',
      files: [
        {
          relpath: './packages/a/foo.txt',
          contents: 'foobar'
        }
      ],
      tags: ['2022.6.13-a.v1.0.0-f0']
    },
    {
      msg: 'refactor(a): a refactoring',
      files: [
        {
          relpath: './packages/a/foo.txt',
          contents: 'foobarbaz'
        }
      ]
    },
    {
      msg: 'feat: init pkg b',
      files: [
        {
          relpath: './packages/b/package.json',
          contents: {
            name: 'b',
            version: '',
            dependencies: {
              a: 'workspace:^'
            },
            scripts: {
              build: 'cp index.js bundle.js',
              test: "node ./index.js"
            },
            release: {
              build: true,
              fetch: true,
              test: true
            },
            exports: {
              '.': {
                import: './bundle.js'
              }
            },
            type: 'module'
          }
        },
        {
          relpath: './packages/b/index.js',
          contents: `
             export {a} from 'a'
             export const b = 'b'
`
        }
      ]
    },
    {
      msg: 'fix(b): add some file',
      files: [
        {
          relpath: './packages/b/file.txt',
          contents: 'foo bar'
        }
      ]
    }
  ]
})

$.cwd = cwd
await $`yarn install`

test('run() dry-run', async () => {
  await run({cwd, flags: {dryRun: true}})
})

test('run()', async () => {
  const registry = createNpmRegistry()

  await registry.start()

  await run({cwd})

  await ctx(async ($) => {
    $.cwd = cwd
    const digestA = JSON.parse((await $`npm view a@1.0.1 --registry=${registry.address} --json`).toString())
    const digestB = JSON.parse((await $`npm view b@1.0.0 --registry=${registry.address} --json`).toString())

    assert.is(digestA['dist-tags'].latest, '1.0.1')
    assert.is(digestA.dist.tarball, 'http://localhost:4873/a/-/a-1.0.1.tgz')
    assert.is(digestB['dist-tags'].latest, '1.0.0')
    assert.is(digestB.dist.tarball, 'http://localhost:4873/b/-/b-1.0.0.tgz')

    const tag = formatTag({name: 'a', version: '1.0.1'})
    assert.is((await $`git for-each-ref refs/tags/${tag} --format='%(contents)'`).toString().trim(), tag)

    const origin = (await $`git remote get-url origin`).toString().trim()
    const meta = tempy.temporaryDirectory()

    await $`git clone --single-branch --branch meta --depth 1 ${origin} ${meta}`
    assert.is((await fs.readJson(`${meta}/${tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.json`)).version, '1.0.1')
  })

  await addCommits({cwd, commits: [
    {
      msg: 'feat(b): add feat',
      files: [
        {
          relpath: './packages/b/feat.txt',
          contents: 'new feat'
        }
      ]
    }
  ]})

  await run({cwd})

  await ctx(async ($) => {
    $.cwd = cwd
    const digestA = JSON.parse((await $`npm view a --registry=${registry.address} --json`).toString())
    const digestB = JSON.parse((await $`npm view b --registry=${registry.address} --json`).toString())

    assert.is(digestA['dist-tags'].latest, '1.0.1')
    assert.is(digestA.dist.tarball, 'http://localhost:4873/a/-/a-1.0.1.tgz')
    assert.is(digestB['dist-tags'].latest, '1.1.0')
    assert.is(digestB.dist.tarball, 'http://localhost:4873/b/-/b-1.1.0.tgz')

    const tag = formatTag({name: 'b', version: '1.1.0'})
    assert.is((await $`git for-each-ref refs/tags/${tag} --format='%(contents)'`).toString().trim(), tag)

    const origin = (await $`git remote get-url origin`).toString().trim()
    const meta = tempy.temporaryDirectory()

    await $`git clone --single-branch --branch meta --depth 1 ${origin} ${meta}`
    assert.is((await fs.readJson(`${meta}/${tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.json`)).version, '1.1.0')
  })

  await registry.stop()
})

} catch (e) {
  console.error(e)

  throw e
}

test.run()
