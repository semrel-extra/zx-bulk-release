import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {tempy, fs} from 'zx-extra'
import path from 'node:path'
import http from 'node:http'
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

const test = suite('gh')

// Fake GH API server
const requests = []
let routes = {}
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', () => {
    requests.push({method: req.method, url: req.url, headers: req.headers, body})
    const key = `${req.method} ${req.url}`
    for (const [pattern, handler] of Object.entries(routes)) {
      if (key.includes(pattern) || new RegExp(pattern).test(key)) {
        return handler(req, res, body)
      }
    }
    res.writeHead(404)
    res.end('{}')
  })
})

await new Promise(r => server.listen(0, '127.0.0.1', r))
const ghApiUrl = `http://127.0.0.1:${server.address().port}`

test.after(() => server.close())

test.before.each(() => {
  requests.length = 0
  routes = {}
})

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

test('`prepareAssets()` preprocesses files for publishing', async () => {
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
  routes['GET /repos/o/r'] = (req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'})
    res.end('{"id":1}')
  }

  const res = await ghFetch(`${ghApiUrl}/repos/o/r`, {ghToken: 'tok123'})
  assert.ok(res.ok)
  assert.is(requests[0].headers.accept, GH_ACCEPT)
  assert.is(requests[0].headers['x-github-api-version'], GH_API_VERSION)
  assert.is(requests[0].headers.authorization, 'token tok123')
})

test('ghFetch omits Authorization when no token', async () => {
  routes['GET /repos/o/r'] = (req, res) => {
    res.writeHead(200)
    res.end('{}')
  }

  await ghFetch(`${ghApiUrl}/repos/o/r`)
  assert.ok(!requests[0].headers.authorization)
})

test('ghCreateRelease posts and returns release', async () => {
  routes['POST /repos/o/r/releases'] = (req, res) => {
    const body = JSON.parse(requests.at(-1)?.body || '{}')
    res.writeHead(201, {'Content-Type': 'application/json'})
    res.end(JSON.stringify({id: 42, upload_url: `${ghApiUrl}/repos/o/r/releases/42/assets`, tag_name: body.tag_name, name: body.name}))
  }

  const res = await ghCreateRelease({ghApiUrl, ghToken: 'tok', repoName: 'o/r', tag: 'v1.0.0', body: 'notes'})
  assert.is(res.id, 42)
  assert.ok(res.upload_url)
  const sent = JSON.parse(requests[0].body)
  assert.is(sent.tag_name, 'v1.0.0')
  assert.is(sent.name, 'v1.0.0')
})

test('ghCreateRelease throws on missing upload_url', async () => {
  routes['POST /repos/o/r/releases'] = (req, res) => {
    res.writeHead(422, {'Content-Type': 'application/json'})
    res.end('{"message":"Validation Failed"}')
  }

  try {
    await ghCreateRelease({ghApiUrl, ghToken: 'tok', repoName: 'o/r', tag: 'v1.0.0', body: ''})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('gh release failed'))
  }
})

test('ghDeleteReleaseByTag fetches then deletes', async () => {
  routes['/repos/o/r/releases/tags/'] = (req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'})
    res.end('{"id":99}')
  }
  routes['DELETE /repos/o/r/releases/99'] = (req, res) => {
    res.writeHead(204)
    res.end()
  }

  const result = await ghDeleteReleaseByTag({ghApiUrl, ghToken: 'tok', repoName: 'o/r', tag: 'v1.0.0'})
  assert.ok(result)
  assert.is(requests.length, 2)
  assert.is(requests[1].method, 'DELETE')
})

test('ghDeleteReleaseByTag returns false when not found', async () => {
  // default 404 route handles this
  const result = await ghDeleteReleaseByTag({ghApiUrl, ghToken: 'tok', repoName: 'o/r', tag: 'v1.0.0'})
  assert.is(result, false)
})

test('ghUploadAssets uploads files', async () => {
  const cwd = tempy.temporaryDirectory()
  await fs.outputFile(path.resolve(cwd, 'dist.txt'), 'hello')

  routes['POST /repos/o/r/releases/42/assets'] = (req, res) => {
    res.writeHead(201, {'Content-Type': 'application/json'})
    res.end('{"id":1}')
  }

  const results = await ghUploadAssets({
    ghToken: 'tok',
    ghAssets: [{name: 'dist.txt', source: 'dist.txt'}],
    uploadUrl: `${ghApiUrl}/repos/o/r/releases/42/assets`,
    cwd,
  })
  assert.is(results.length, 1)
  assert.ok(requests[0].url.includes('?name=dist.txt'))
  assert.is(requests[0].method, 'POST')
})

test('ghUploadAssets throws on failed upload', async () => {
  const cwd = tempy.temporaryDirectory()
  await fs.outputFile(path.resolve(cwd, 'dist.txt'), 'hello')

  routes['POST /repos/o/r/releases/42/assets'] = (req, res) => {
    res.writeHead(500)
    res.end('error')
  }

  try {
    await ghUploadAssets({
      ghToken: 'tok',
      ghAssets: [{name: 'dist.txt', source: 'dist.txt'}],
      uploadUrl: `${ghApiUrl}/repos/o/r/releases/42/assets`,
      cwd,
    })
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('gh asset upload failed'))
  }
})

test('ghGetAsset fetches asset content', async () => {
  routes['/releases/download/v1.0.0/dist.txt'] = (req, res) => {
    res.writeHead(200)
    res.end('asset-content')
  }

  const content = await ghGetAsset({repoName: 'o/r', tag: 'v1.0.0', name: 'dist.txt', ghUrl: ghApiUrl})
  assert.is(content, 'asset-content')
})

test('ghGetAsset throws on 404', async () => {
  // default 404 route handles this
  try {
    await ghGetAsset({repoName: 'o/r', tag: 'v1.0.0', name: 'missing.txt', ghUrl: ghApiUrl})
    assert.unreachable('should have thrown')
  } catch (e) {
    assert.ok(e.message.includes('gh asset fetch failed'))
  }
})

test.run()
