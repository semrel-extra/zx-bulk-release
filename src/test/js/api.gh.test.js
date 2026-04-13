import {describe, test, expect, afterAll, beforeAll, beforeEach} from 'vitest'
import {tempy, fs} from 'zx-extra'
import path from 'node:path'
import {
  ghPrepareAssets,
  getCommonPath,
  ghFetch,
  ghCreateRelease,
  ghGetAsset,
  GH_API_VERSION,
  GH_ACCEPT,
} from '../../main/js/post/api/gh.js'
import {createGhServer} from './utils/gh-server.js'

describe('api.gh', () => {
  let gh
  beforeAll(async () => { gh = await createGhServer() })
  afterAll(() => gh.close())
  beforeEach(() => { Object.keys(gh.routes).forEach(k => delete gh.routes[k]); gh.requests.length = 0 })

  test('getCommonPath()', () => {
    const cases = [
      ['single dir',                  ['foo/bar/'],                       'foo/bar/'],
      ['single file',                 ['baz.json'],                       ''],
      ['single file in nested dir',   ['foo/bar/baz.json'],               'foo/bar/'],
      ['pair of files in same dir',   ['foo/bar.json', 'foo/baz.json'],   'foo/'],
      ['pair of dirs',                ['foo/bar/qux/', 'foo/bar/baz/'],   'foo/bar/'],
    ]
    cases.forEach(([name, input, expected]) => {
      expect(getCommonPath(input)).toEqual(expected)
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

    expect(await fs.readFile(path.resolve(temp, 'a.json'), 'utf8')).toEqual('{"foo": "bar"}')
    expect(await fs.readFile(path.resolve(temp, 'c.json'), 'utf8')).toEqual('{"quuux": "quuux"}')
    expect(await fs.readFile(path.resolve(temp, 'baz.txt'), 'utf8')).toEqual('baz')
  })

  test('ghFetch sends correct headers', async () => {
    gh.setRoutes({'GET /repos/o/r': (req, res) => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end('{"id":1}') }})
    const res = await ghFetch(`${gh.url}/repos/o/r`, {ghToken: 'tok123'})
    expect(res.ok).toBeTruthy()
    expect(gh.requests[0].headers.accept).toBe(GH_ACCEPT)
    expect(gh.requests[0].headers['x-github-api-version']).toBe(GH_API_VERSION)
    expect(gh.requests[0].headers.authorization).toBe('token tok123')
  })

  test('ghFetch omits Authorization when no token', async () => {
    gh.setRoutes({'GET /repos/o/r': (req, res) => { res.writeHead(200); res.end('{}') }})
    await ghFetch(`${gh.url}/repos/o/r`)
    expect(gh.requests[0].headers.authorization).toBeFalsy()
  })

  test('ghCreateRelease posts and returns release', async () => {
    gh.setRoutes({
      'POST /repos/o/r/releases': (req, res) => {
        res.writeHead(201, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({id: 42, upload_url: `${gh.url}/repos/o/r/releases/42/assets`}))
      }
    })
    const res = await ghCreateRelease({ghApiUrl: gh.url, ghToken: 'tok', repoName: 'o/r', tag: 'v1.0.0', body: 'notes'})
    expect(res.id).toBe(42)
    expect(res.upload_url).toBeTruthy()
    const sent = JSON.parse(gh.requests[0].body)
    expect(sent.tag_name).toBe('v1.0.0')
  })

  test('ghCreateRelease throws on missing upload_url', async () => {
    gh.setRoutes({
      'POST /repos/o/r/releases': (req, res) => { res.writeHead(422, {'Content-Type': 'application/json'}); res.end('{"message":"Validation Failed"}') }
    })
    try {
      await ghCreateRelease({ghApiUrl: gh.url, ghToken: 'tok', repoName: 'o/r', tag: 'v1.0.0', body: ''})
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e.message.includes('gh release failed')).toBeTruthy()
    }
  })

  test('ghGetAsset fetches asset content', async () => {
    gh.setRoutes({
      '/releases/download/v1.0.0/dist.txt': (req, res) => { res.writeHead(200); res.end('asset-content') }
    })
    const content = await ghGetAsset({repoName: 'o/r', tag: 'v1.0.0', name: 'dist.txt', ghUrl: gh.url})
    expect(content).toBe('asset-content')
  })

  test('ghGetAsset throws on 404', async () => {
    try {
      await ghGetAsset({repoName: 'o/r', tag: 'v1.0.0', name: 'missing.txt', ghUrl: gh.url})
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e.message.includes('gh asset fetch failed')).toBeTruthy()
    }
  })

})
