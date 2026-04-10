import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {tempy, fs} from 'zx-extra'
import path from 'node:path'
import {
  ghPrepareAssets,
  getCommonPath,
  ghFetch,
  ghCreateRelease,
  ghDeleteReleaseByTag,
  ghUploadAssets,
  ghGetAsset,
  GH_API_VERSION,
  GH_ACCEPT,
} from '../../main/js/processor/api/gh.js'
import {createGhServer} from './utils/gh-server.js'

const test = suite('api.gh')

const gh = await createGhServer()
test.after(() => gh.close())
test.before.each(() => { Object.keys(gh.routes).forEach(k => delete gh.routes[k]); gh.requests.length = 0 })

test('getCommonPath()', () => {
  const cases = [
    ['single dir',                  ['foo/bar/'],                       'foo/bar/'],
    ['single file',                 ['baz.json'],                       ''],
    ['single file in nested dir',   ['foo/bar/baz.json'],               'foo/bar/'],
    ['pair of files in same dir',   ['foo/bar.json', 'foo/baz.json'],   'foo/'],
    ['pair of dirs',                ['foo/bar/qux/', 'foo/bar/baz/'],   'foo/bar/'],
  ]
  cases.forEach(([name, input, expected]) => {
    assert.equal(getCommonPath(input), expected, name)
  })
})

test('prepareAssets preprocesses files for publishing', async () => {
  const cwd = tempy.temporaryDirectory()
  await fs.outputFile(path.resolve(cwd, 'target/json/a.json'), '{"foo": "bar"}')
  await fs.outputFile(path.resolve(cwd, 'target/json/b.json'), '{"baz": "qux"}')
  await fs.outputFile(path.resolve(cwd, 'c.json'), '{"quuux": "quuux"}')
  await fs.outputFile(path.resolve(cwd, 'd.json'), '{"duuux": "duuux"}')

  const temp = await ghPrepareAssets([
    { name: 'jsons.zip', source: ['target/**/*.json'], zip: true, cwd},
    { name: 'a.zip', source: 'target/json/a.json', zip: true },
    { name: 'a.json', source: 'target/json/a.json', cwd },
    { name: 'c.json', source: 'c.json', cwd },
    { name: 'jsons2.zip', source: '*.json', cwd },
    { name: 'baz.txt', contents: 'baz' },
  ], cwd)

  assert.equal(await fs.readFile(path.resolve(temp, 'a.json'), 'utf8'), '{"foo": "bar"}')
  assert.equal(await fs.readFile(path.resolve(temp, 'c.json'), 'utf8'), '{"quuux": "quuux"}')
  assert.equal(await fs.readFile(path.resolve(temp, 'baz.txt'), 'utf8'), 'baz')
})

test('ghFetch sends correct headers', async () => {
  gh.setRoutes({'GET /repos/o/r': (req, res) => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end('{"id":1}') }})
  const res = await ghFetch(`${gh.url}/repos/o/r`, {ghToken: 'tok123'})
  assert.ok(res.ok)
  assert.is(gh.requests[0].headers.accept, GH_ACCEPT)
  assert.is(gh.requests[0].headers['x-github-api-version'], GH_API_VERSION)
  assert.is(gh.requests[0].headers.authorization, 'token tok123')
})

test('ghFetch omits Authorization when no token', async () => {
  gh.setRoutes({'GET /repos/o/r': (req, res) => { res.writeHead(200); res.end('{}') }})
  await ghFetch(`${gh.url}/repos/o/r`)
  assert.ok(!gh.requests[0].headers.authorization)
})

test('ghCreateRelease posts and returns release', async () => {
  gh.setRoutes({
    'POST /repos/o/r/releases': (req, res) => {
      res.writeHead(201, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({id: 42, upload_url: `${gh.url}/repos/o/r/releases/42/assets`}))
    }
  })
  const res = await ghCreateRelease({ghApiUrl: gh.url, ghToken: 'tok', repoName: 'o/r', tag: 'v1.0.0', body: 'notes'})
  assert.is(res.id, 42)
  assert.ok(res.upload_url)
  const sent = JSON.parse(gh.requests[0].body)
  assert.is(sent.tag_name, 'v1.0.0')
})

test('ghCreateRelease throws on missing upload_url', async () => {
  gh.setRoutes({
    'POST /repos/o/r/releases': (req, res) => { res.writeHead(422, {'Content-Type': 'application/json'}); res.end('{"message":"Validation Failed"}') }
  })
  try {
    await ghCreateRelease({ghApiUrl: gh.url, ghToken: 'tok', repoName: 'o/r', tag: 'v1.0.0', body: ''})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('gh release failed'))
  }
})

test('ghDeleteReleaseByTag fetches then deletes', async () => {
  gh.setRoutes({
    '/repos/o/r/releases/tags/': (req, res) => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end('{"id":99}') },
    'DELETE /repos/o/r/releases/99': (req, res) => { res.writeHead(204); res.end() },
  })
  const result = await ghDeleteReleaseByTag({ghApiUrl: gh.url, ghToken: 'tok', repoName: 'o/r', tag: 'v1.0.0'})
  assert.ok(result)
  assert.is(gh.requests.length, 2)
  assert.is(gh.requests[1].method, 'DELETE')
})

test('ghDeleteReleaseByTag returns false when not found', async () => {
  const result = await ghDeleteReleaseByTag({ghApiUrl: gh.url, ghToken: 'tok', repoName: 'o/r', tag: 'v1.0.0'})
  assert.is(result, false)
})

test('ghUploadAssets uploads files', async () => {
  const cwd = tempy.temporaryDirectory()
  await fs.outputFile(path.resolve(cwd, 'dist.txt'), 'hello')
  gh.setRoutes({
    'POST /repos/o/r/releases/42/assets': (req, res) => { res.writeHead(201, {'Content-Type': 'application/json'}); res.end('{"id":1}') }
  })
  const results = await ghUploadAssets({
    ghToken: 'tok',
    ghAssets: [{name: 'dist.txt', source: 'dist.txt'}],
    uploadUrl: `${gh.url}/repos/o/r/releases/42/assets`,
    cwd,
  })
  assert.is(results.length, 1)
  assert.ok(gh.requests[0].url.includes('?name=dist.txt'))
  assert.is(gh.requests[0].method, 'POST')
})

test('ghUploadAssets throws on failed upload', async () => {
  const cwd = tempy.temporaryDirectory()
  await fs.outputFile(path.resolve(cwd, 'dist.txt'), 'hello')
  gh.setRoutes({
    'POST /repos/o/r/releases/42/assets': (req, res) => { res.writeHead(500); res.end('error') }
  })
  try {
    await ghUploadAssets({
      ghToken: 'tok',
      ghAssets: [{name: 'dist.txt', source: 'dist.txt'}],
      uploadUrl: `${gh.url}/repos/o/r/releases/42/assets`,
      cwd,
    })
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('gh asset upload failed'))
  }
})

test('ghGetAsset fetches asset content', async () => {
  gh.setRoutes({
    '/releases/download/v1.0.0/dist.txt': (req, res) => { res.writeHead(200); res.end('asset-content') }
  })
  const content = await ghGetAsset({repoName: 'o/r', tag: 'v1.0.0', name: 'dist.txt', ghUrl: gh.url})
  assert.is(content, 'asset-content')
})

test('ghGetAsset throws on 404', async () => {
  try {
    await ghGetAsset({repoName: 'o/r', tag: 'v1.0.0', name: 'missing.txt', ghUrl: gh.url})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('gh asset fetch failed'))
  }
})

test.run()
