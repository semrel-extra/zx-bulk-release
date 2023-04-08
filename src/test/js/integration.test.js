import {suite} from 'uvu'
import * as assert from 'uvu/assert'

import {ctx, tempy, fs, path, $} from 'zx-extra'
import {run} from '../../main/js/index.js'
import {formatTag} from '../../main/js/meta.js'
import {addCommits, createFakeRepo, createNpmRegistry, fixtures} from './test-utils.js'

const test = suite('integration')
const report = tempy.temporaryFile({extension: 'json'})

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
            packageManager: 'yarn@4.0.0-rc.14'
          }
        },
        {
          relpath: '.yarnrc.yml',
          contents: 'yarnPath: .yarn/releases/yarn-4.0.0-rc.14.cjs'
        },
        {
          relpath: '.yarn/releases/yarn-4.0.0-rc.14.cjs',
          contents: fs.readFileSync(path.resolve(fixtures, 'regular-monorepo/.yarn/releases/yarn-4.0.0-rc.14.cjs'), 'utf8')
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
              buildCmd: 'yarn && yarn build',
              testCmd: 'yarn test',
              fetch: true,
              changelog: 'changelog'
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
          contents: 'export const a = "a"; console.log("test: ./packages/a/index.js loaded")'
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
            version: '1.0.0',
            dependencies: {
              a: 'workspace:^'
            },
            scripts: {
              build: 'cp index.js bundle.js && mkdir -p docs && echo "# docs" > docs/readme.md',
              test: "node ./index.js"
            },
            release: {
              buildCmd: 'yarn && yarn build',
              publishCmd: 'echo "custom publish: ${{name}} ${{version}}"',
              testCmd: `yarn test &&
                echo "test: \${{name}}" &&
                echo "test: \${{version}}" &&
                echo "
                  \${{name}}
                  \${{version}}
                  \${{git.sha}}
                  \${{git.root}}
                " | awk '{$1=$1};1' > test.txt
`,
              fetch: true,
              ghPages: 'gh-pages docs b'
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
             console.log('test: ./packages/b/index.js loaded')
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

// console.log('cwd=', cwd)
$.cwd = cwd
await $`yarn install`

test('run() dry-run', async () => {
  await run({cwd, flags: {dryRun: true, report}})
  const r = await fs.readJson(report)
  const {a, b} = r.packages

  assert.equal(r.queue, ['a', 'b'])
  assert.equal(r.status, 'success')

  assert.equal(a.name, 'a')
  assert.equal(a.version, '1.0.1')
  assert.equal(a.prevVersion, 'v1.0.0')
  assert.equal(a.releaseType, 'patch')
  assert.equal(a.status, 'success')

  assert.equal(b.name, 'b')
  assert.equal(b.version, '1.0.0')
  assert.equal(b.prevVersion, '1.0.0')
  assert.equal(b.releaseType, 'minor')
  assert.equal(b.status, 'success')
})

test('run()', async () => {
  const registry = createNpmRegistry()

  await registry.start()

  await run({cwd, flags: {onlyWorkspaceDeps: true}})

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
    const chlog = tempy.temporaryDirectory()

    await $`git clone --single-branch --branch meta --depth 1 ${origin} ${meta}`
    assert.is((await fs.readJson(`${meta}/${tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.json`)).version, '1.0.1')

    await $`git clone --single-branch --branch changelog --depth 1 ${origin} ${chlog}`
    assert.ok((await fs.readFile(`${chlog}/a-changelog.md`, 'utf-8')).includes('### Fixes & improvements'))

    // verify cmd context via side-effects
    const sha = (await $`git rev-parse HEAD`).toString().trim()
    const gitRoot = (await $`git rev-parse --show-toplevel`).toString().trim()
    assert.ok((await fs.readFile(`${cwd}/packages/b/test.txt`, 'utf-8'))
      .includes(`
b
1.0.0
${sha}
${gitRoot}
`)
    )
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

  await run({cwd, flags: {onlyWorkspaceDeps: true}})

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
    const ghp = tempy.temporaryDirectory()

    await $`git clone --single-branch --branch meta --depth 1 ${origin} ${meta}`
    assert.is((await fs.readJson(`${meta}/${tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.json`)).version, '1.1.0')

    await $`git clone --single-branch --branch gh-pages --depth 1 ${origin} ${ghp}`
    assert.is((await fs.readFile(`${ghp}/b/readme.md`, 'utf-8')).trim(), '# docs')
  })

  await addCommits({cwd, commits: [
    {
      msg: 'refactor(a): refactorings',
      files: [
        {
          relpath: './packages/a/refactored.txt',
          contents: 'refactored'
        }
      ]
    }
  ]})

  await run({cwd, flags: {onlyWorkspaceDeps: true, snapshot: true}})

  await ctx(async ($) => {
    $.cwd = cwd
    const digestA = JSON.parse((await $`npm view a --registry=${registry.address} --json`).toString())
    const digestB = JSON.parse((await $`npm view b --registry=${registry.address} --json`).toString())

    assert.ok(digestA['dist-tags'].snapshot.startsWith('1.0.2-snap.'))
    assert.ok(digestB['dist-tags'].snapshot.startsWith, '1.1.1-snap.')
  })

  await registry.stop()
})

test.run()
