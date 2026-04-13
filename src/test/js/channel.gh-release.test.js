import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within, fs, tempy} from 'zx-extra'
import path from 'node:path'
import {createSpawnMock, defaultResponses, makePkg} from './utils/mock.js'
import {createGhServer} from './utils/gh-server.js'
import ghRelease from '../../main/js/post/courier/channels/gh-release.js'

const test = suite('channel.gh-release')

const gh = await createGhServer()
test.after(() => gh.close())

const setup = (responses = []) => {
  Object.keys(gh.routes).forEach(k => delete gh.routes[k])
  gh.requests.length = 0
  const mock = createSpawnMock([...responses, ...defaultResponses()])
  $.spawn = mock.spawn
  $.quiet = true
  $.verbose = false
  $.memo = new Map()
  $.report = undefined
  return mock
}

const makeData = (pkg, overrides = {}) => ({
  tag: pkg.tag,
  token: pkg.config.ghToken,
  apiUrl: pkg.config.ghApiUrl,
  repoName: 'test-org/test-repo',
  releaseNotes: '## release notes',
  assets: pkg.config.ghAssets,
  assetsDir: overrides.assetsDir,
  ...overrides,
})

test('when checks ghToken', () => {
  assert.is(ghRelease.when({config: {ghToken: 'tok'}}), true)
  assert.is(ghRelease.when({config: {}}), false)
  assert.is(ghRelease.name, 'gh-release')
})

test('run creates release', async () => {
  await within(async () => {
    setup()
    gh.setRoutes({
      'POST /repos/test-org/test-repo/releases': (req, res) => {
        res.writeHead(201, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({id: 1, upload_url: `${gh.url}/uploads{?name,label}`}))
      }
    })

    const pkg = makePkg({config: {ghToken: 'tok', ghApiUrl: gh.url, ghBasicAuth: 'x:tok'}})
    await ghRelease.run(makeData(pkg))

    assert.is(gh.requests.length, 1)
    assert.is(gh.requests[0].method, 'POST')
    const sent = JSON.parse(gh.requests[0].body)
    assert.is(sent.tag_name, pkg.tag)
  })
})

test('run skips when no ghToken', async () => {
  await within(async () => {
    setup()
    const pkg = makePkg({config: {ghToken: '', ghApiUrl: gh.url}})
    const result = await ghRelease.run(makeData(pkg))
    assert.is(result, null)
    assert.is(gh.requests.length, 0)
  })
})

test('run uploads assets', async () => {
  await within(async () => {
    setup()
    const dir = tempy.temporaryDirectory()
    await fs.outputFile(path.resolve(dir, 'assets/dist.txt'), 'hello')

    gh.setRoutes({
      'POST /repos/test-org/test-repo/releases': (req, res) => {
        res.writeHead(201, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({id: 1, upload_url: `${gh.url}/uploads?name=x`}))
      },
      'POST /uploads': (req, res) => {
        res.writeHead(201, {'Content-Type': 'application/json'})
        res.end('{"id":2}')
      },
    })

    const pkg = makePkg({
      config: {ghToken: 'tok', ghApiUrl: gh.url, ghBasicAuth: 'x:tok', ghAssets: [{name: 'dist.txt', source: 'dist.txt'}]},
    })
    await ghRelease.run(makeData(pkg), dir)

    assert.ok(gh.requests.some(r => r.url.includes('/uploads')))
  })
})

test('run returns duplicate on already_exists error', async () => {
  await within(async () => {
    setup()
    gh.setRoutes({
      'POST /repos/test-org/test-repo/releases': (req, res) => {
        res.writeHead(422, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({message: 'Validation Failed', errors: [{code: 'already_exists'}]}))
      }
    })

    const pkg = makePkg({config: {ghToken: 'tok', ghApiUrl: gh.url, ghBasicAuth: 'x:tok'}})
    const result = await ghRelease.run(makeData(pkg))
    assert.is(result, 'duplicate')
  })
})

test('run rethrows non-duplicate errors', async () => {
  await within(async () => {
    setup()
    gh.setRoutes({
      'POST /repos/test-org/test-repo/releases': (req, res) => {
        res.writeHead(500, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({message: 'Internal Server Error'}))
      }
    })

    const pkg = makePkg({config: {ghToken: 'tok', ghApiUrl: gh.url, ghBasicAuth: 'x:tok'}})
    try {
      await ghRelease.run(makeData(pkg))
      assert.unreachable('should throw')
    } catch (e) {
      assert.ok(e.message)
    }
  })
})

test.run()
