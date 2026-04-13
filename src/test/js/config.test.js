import {describe, test, expect} from 'vitest'
import {fs, path, tempy} from 'zx-extra'
import {parseEnv, normalizeMetaConfig, cosmiconfig} from '../../main/js/config.js'
import {GH_URL} from '../../main/js/post/api/gh.js'

describe('config', () => {
  test('parseEnv() sets npmOidc from NPM_OIDC', () => {
    const config = parseEnv({NPM_OIDC: 'true'})
    expect(config.npmOidc).toBeTruthy()
  })

  test('parseEnv() auto-detects npmOidc when no NPM_TOKEN and ACTIONS_ID_TOKEN_REQUEST_URL present', () => {
    const config = parseEnv({
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.githubusercontent.com'
    })
    expect(config.npmOidc).toBeTruthy()
  })

  test('parseEnv() does not set npmOidc when NPM_TOKEN is present', () => {
    const config = parseEnv({
      NPM_TOKEN: 'some-token',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.githubusercontent.com'
    })
    expect(config.npmOidc).toBeFalsy()
  })

  test('parseEnv() does not set npmOidc when neither NPM_OIDC nor ACTIONS_ID_TOKEN_REQUEST_URL', () => {
    const config = parseEnv({})
    expect(config.npmOidc).toBeFalsy()
  })

  test('parseEnv() NPM_OIDC overrides NPM_TOKEN presence', () => {
    const config = parseEnv({
      NPM_OIDC: 'true',
      NPM_TOKEN: 'some-token'
    })
    expect(config.npmOidc).toBeTruthy()
  })

  test('parseEnv() defaults ghUser to x-access-token when GH_TOKEN present', () => {
    const config = parseEnv({GH_TOKEN: 'tok'})
    expect(config.ghUser).toBe('x-access-token')
  })

  test('parseEnv() ghUser is undefined when no token', () => {
    const config = parseEnv({})
    expect(config.ghUser).toBe(undefined)
  })

  test('normalizeMetaConfig(false) disables meta', () => {
    expect(normalizeMetaConfig(false).type).toBe(null)
  })

  test('normalizeMetaConfig("none") disables meta', () => {
    expect(normalizeMetaConfig('none').type).toBe(null)
  })

  test('normalizeMetaConfig(true) defaults to commit', () => {
    expect(normalizeMetaConfig(true).type).toBe('commit')
  })

  test('normalizeMetaConfig("asset") sets asset type', () => {
    expect(normalizeMetaConfig('asset').type).toBe('asset')
  })

  test('GH_URL defaults to https://github.com', () => {
    expect(GH_URL).toBe('https://github.com')
  })

  test('parseEnv() defaults ghUrl', () => {
    expect(parseEnv({}).ghUrl).toBe('https://github.com')
  })

  test('parseEnv() picks GH_URL', () => {
    expect(parseEnv({GH_URL: 'https://ghe.corp.com'}).ghUrl).toBe('https://ghe.corp.com')
  })

  test('parseEnv() picks GITHUB_URL as fallback', () => {
    expect(parseEnv({GITHUB_URL: 'https://ghe.corp.com'}).ghUrl).toBe('https://ghe.corp.com')
  })

  test('parseEnv() ghApiUrl defaults to api.github.com', () => {
    expect(parseEnv({}).ghApiUrl).toBe('https://api.github.com')
  })

  test('parseEnv() ghApiUrl resolves /api/v3 for GHE', () => {
    expect(parseEnv({GH_URL: 'https://ghe.corp.com'}).ghApiUrl).toBe('https://ghe.corp.com/api/v3')
    expect(parseEnv({GH_URL: 'https://ghe.corp.com/'}).ghApiUrl).toBe('https://ghe.corp.com/api/v3')
  })
})

describe('cosmiconfig', () => {
  test('search finds .json config', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeJson(path.join(dir, '.apprc.json'), {key: 'json-value'})
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc.json']}).search(dir)
    expect(result.key).toBe('json-value')
  })

  test('search finds .yaml config', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeFile(path.join(dir, '.apprc.yaml'), 'key: yaml-value\n')
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc.yaml']}).search(dir)
    expect(result.key).toBe('yaml-value')
  })

  test('search finds .yml config', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeFile(path.join(dir, '.apprc.yml'), 'key: yml-value\n')
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc.yml']}).search(dir)
    expect(result.key).toBe('yml-value')
  })

  test('search finds rc file with JSON content', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeFile(path.join(dir, '.apprc'), JSON.stringify({key: 'rc-json'}))
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc']}).search(dir)
    expect(result.key).toBe('rc-json')
  })

  test('search finds rc file with YAML content', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeFile(path.join(dir, '.apprc'), 'key: rc-yaml\nnested:\n  a: 1\n')
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc']}).search(dir)
    expect(result.key).toBe('rc-yaml')
    expect(result.nested.a).toBe(1)
  })

  test('search reads named key from package.json', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeJson(path.join(dir, 'package.json'), {name: 'pkg', myapp: {key: 'from-pkg'}})
    const result = await cosmiconfig('myapp', {searchPlaces: ['package.json']}).search(dir)
    expect(result.key).toBe('from-pkg')
  })

  test('search skips package.json when named key is missing', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeJson(path.join(dir, 'package.json'), {name: 'pkg', version: '1.0.0'})
    const result = await cosmiconfig('myapp', {searchPlaces: ['package.json']}).search(dir)
    expect(result).toBe(undefined)
  })

  test('search loads .js config', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeFile(path.join(dir, 'app.config.js'), 'export default { key: "from-js" }')
    const result = await cosmiconfig('app', {searchPlaces: ['app.config.js']}).search(dir)
    expect(result.key).toBe('from-js')
  })

  test('search respects searchPlaces order', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeJson(path.join(dir, '.apprc.json'), {source: 'json'})
    await fs.writeFile(path.join(dir, '.apprc.yaml'), 'source: yaml\n')
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc.json', '.apprc.yaml']}).search(dir)
    expect(result.source).toBe('json')
  })

  test('search falls through to next searchPlace when file missing', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeFile(path.join(dir, '.apprc.yaml'), 'source: yaml\n')
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc.json', '.apprc.yaml']}).search(dir)
    expect(result.source).toBe('yaml')
  })

  test('search walks up to parent directories', async () => {
    const root = tempy.temporaryDirectory()
    const deep = path.join(root, 'a', 'b', 'c')
    await fs.ensureDir(deep)
    await fs.writeJson(path.join(root, '.apprc.json'), {level: 'root'})
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc.json']}).search(deep)
    expect(result.level).toBe('root')
  })

  test('search prefers closer directory over parent', async () => {
    const root = tempy.temporaryDirectory()
    const child = path.join(root, 'sub')
    await fs.ensureDir(child)
    await fs.writeJson(path.join(root, '.apprc.json'), {level: 'root'})
    await fs.writeJson(path.join(child, '.apprc.json'), {level: 'child'})
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc.json']}).search(child)
    expect(result.level).toBe('child')
  })

  test('search returns undefined when nothing found anywhere', async () => {
    const dir = tempy.temporaryDirectory()
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc.json']}).search(dir)
    expect(result).toBe(undefined)
  })

  test('search parses complex YAML structures', async () => {
    const dir = tempy.temporaryDirectory()
    await fs.writeFile(path.join(dir, '.apprc.yaml'), [
      'plugins:',
      '  - name: a',
      '    enabled: true',
      '  - name: b',
      '    enabled: false',
      'settings:',
      '  timeout: 30',
      '  retries: 3',
    ].join('\n'))
    const result = await cosmiconfig('app', {searchPlaces: ['.apprc.yaml']}).search(dir)
    expect(result.plugins.length).toBe(2)
    expect(result.plugins[0].name).toBe('a')
    expect(result.settings.timeout).toBe(30)
  })
})
