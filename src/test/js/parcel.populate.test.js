import {describe, test, expect} from 'vitest'
import {DEFAULT_POPULATE, mergePopulate, matchSchema, validateValue, checkManifest} from '../../main/js/post/parcel/index.js'
import {resolveManifest} from '../../main/js/post/courier/index.js'

describe('parcel.populate', () => {
  const env = {NPM_TOKEN: 'npm_SECRET', GH_TOKEN: 'ghp_SECRET', NPM_REGISTRY: 'https://registry.npmjs.org/'}

  const strict = mergePopulate({
    schemas: {
      secret: {type: 'secret'},
      npmjs:  {type: 'url', protocol: 'https:', hostname: 'registry.npmjs.org'},
      repo:   {type: 'url', protocol: 'https:', hostname: 'github.com', pathname: '/org/repo.git', username: 'x-access-token', password: {type: 'secret'}},
    },
    channels: {
      npm:       {token: {schema: 'secret'}, registry: {schema: 'npmjs'}},
      changelog: {repoAuthedUrl: {schema: 'repo'}},
    },
  })

  const check = (raw, _env = env, populate = strict) =>
    checkManifest({values: resolveManifest(raw, _env), channel: raw.channel, populate})

  test('default accepts anything', () => {
    expect(mergePopulate()).toEqual(DEFAULT_POPULATE)
    expect(check({channel: 'npm', token: '${{GH_TOKEN}}', registry: 'https://evil.example/'}, env, mergePopulate())).toEqual([])
  })

  test('mergePopulate overlays rules by channel and field', () => {
    const populate = mergePopulate({schemas: {x: {}, secret: {type: 'secret'}}, channels: {'*': {'*': {schema: 'x'}}, npm: {token: {schema: 'secret'}}}})
    expect(populate.channels['*']['*']).toEqual({schema: 'x'})
    expect(populate.channels.npm.token).toEqual({schema: 'secret'})
    expect(mergePopulate(null)).toEqual(DEFAULT_POPULATE)
  })

  test('mergePopulate rejects malformed rules instead of falling back to "anything"', () => {
    expect(() => mergePopulate({channels: {npm: {registry: 'npmjs'}}})).toThrow('populate.channels.npm.registry: must be {schema: name}')
    expect(() => mergePopulate({channels: {npm: {token: {schema: 'missing'}}}})).toThrow("unknown schema 'missing'")
    expect(() => mergePopulate({channels: {npm: {token: {schema: 'constructor'}}}})).toThrow("unknown schema 'constructor'")
    expect(() => mergePopulate({schemas: {npmjs: 'url'}})).toThrow('populate.schemas.npmjs: must be an object')
    expect(() => mergePopulate('npm')).toThrow('populate: must be an object')
  })

  test('mergePopulate checks what the schemas say', () => {
    expect(() => mergePopulate({schemas: {r: {enum: 'https://registry.npmjs.org'}}})).toThrow('populate.schemas.r.enum: must be an array')
    expect(() => mergePopulate({schemas: {r: {pattern: '('}}})).toThrow('populate.schemas.r.pattern: invalid regexp')
    expect(() => mergePopulate({schemas: {r: {type: 'uri'}}})).toThrow("populate.schemas.r.type: unknown type 'uri'")
    expect(() => mergePopulate({schemas: {r: {type: 'url', hostname: ['github.com', 1]}}})).toThrow('populate.schemas.r.hostname: must be strings')
    expect(() => mergePopulate({schemas: {r: {type: 'url', port: 443}}})).toThrow('populate.schemas.r.port: must be an object')
    expect(() => mergePopulate({schemas: {r: {type: 'url', pathname: {pattern: '/org/[\\w.-]+'}, password: {type: 'secret'}}}})).not.toThrow()
  })

  test('mergePopulate rejects __proto__ keys and leaves prototypes alone', () => {
    const config = JSON.parse('{"schemas": {"x": {}}, "channels": {"__proto__": {"registry": {"schema": "x"}}}}')
    expect(() => mergePopulate(config)).toThrow("populate.channels: '__proto__' key is not allowed")
    expect(({}).registry).toBeUndefined()
    expect(() => mergePopulate(JSON.parse('{"schemas": {"__proto__": {}}}'))).toThrow("'__proto__' key is not allowed")
  })

  test('matchSchema picks the best match', () => {
    const populate = mergePopulate({schemas: {secret: {}, 'any-npm': {}, 'npm-token': {}}, channels: {
      '*': {token: {schema: 'secret'}},
      npm: {'*': {schema: 'any-npm'}, token: {schema: 'npm-token'}},
    }})
    expect(matchSchema(populate, 'npm', 'token')).toBe('npm-token')
    expect(matchSchema(populate, 'npm', 'name')).toBe('any-npm')
    expect(matchSchema(populate, 'gh-release', 'token')).toBe('secret')
    expect(matchSchema(populate, 'meta', 'data')).toBe('*')
  })

  test('resolved values are checked against the schemas, any var may be substituted', () => {
    expect(check({channel: 'npm', name: 'a', token: '${{NPM_TOKEN}}', registry: '${{NPM_REGISTRY}}'})).toEqual([])
    expect(check({channel: 'npm', name: 'a', token: '${{GH_TOKEN}}', registry: 'https://registry.npmjs.org/'})).toEqual([])
    expect(check({channel: 'npm', token: '${{NPM_TOKEN}}', registry: '${{NPM_REGISTRY}}'}, {NPM_REGISTRY: 'https://evil.example/'}))
      .toEqual(['token: must be a non-empty secret', 'registry.hostname: expected "registry.npmjs.org"'])
  })

  test('derived fields are checked too', () => {
    const raw = {channel: 'changelog', repoHost: 'github.com', repoName: 'org/repo'}
    expect(check(raw)).toEqual([])
    expect(check({...raw, repoHost: 'evil.example'})).toEqual(['repoAuthedUrl.hostname: expected "github.com"'])
  })

  test('url: undescribed parts must be empty, tricks do not pass', () => {
    const schema = {type: 'url', protocol: 'https:', hostname: 'github.com'}
    expect(validateValue('https://github.com/', schema)).toEqual([])
    expect(validateValue('https://github.com@evil.example/', schema)).toEqual([
      'value.username: is not allowed',
      'value.hostname: expected "github.com"',
    ])
    expect(validateValue('https://github.com:8443/org?x=1#y', schema)).toEqual([
      'value.port: is not allowed',
      'value.pathname: is not allowed',
      'value.search: is not allowed',
      'value.hash: is not allowed',
    ])
    expect(validateValue('github.com/org', schema)).toEqual(['value: must be an absolute URL'])
  })

  test('url: parts match by string, array or nested schema', () => {
    const schema = {type: 'url', protocol: 'https:', hostname: ['github.com', 'ghe.corp'], pathname: {pattern: '/org/[\\w.-]+\\.git'}}
    expect(validateValue('https://ghe.corp/org/repo.git', schema)).toEqual([])
    expect(validateValue('https://github.com/org/repo.git/../../evil.git', schema)).toEqual(['value.pathname: does not match /org/[\\w.-]+\\.git'])
    expect(validateValue('http://github.com/org/repo.git', schema)).toEqual(['value.protocol: expected "https:"'])
  })

  test('string: const, enum and a whole-value pattern', () => {
    expect(validateValue('a', {type: 'string', enum: ['a', 'b']})).toEqual([])
    expect(validateValue('ab', {pattern: 'a'})).toEqual(['value: does not match a'])
    expect(validateValue(1, {type: 'string'})).toEqual(['value: must be a string'])
    expect(validateValue('x', {type: 'oops'})).toEqual(["value: unknown schema type 'oops'"])
  })

  test('errors never contain the resolved values', () => {
    const errors = [
      ...validateValue('npm_SECRET', {const: 'x'}),
      ...validateValue('https://x-access-token:ghp_SECRET@evil.example/', {type: 'url', hostname: 'github.com'}),
      ...check({channel: 'npm', token: '${{GH_TOKEN}}', registry: '${{NPM_TOKEN}}'}),
    ]
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join('\n')).not.toMatch(/_SECRET/)
  })

  test('unknown schema reference is an error, prototype names included', () => {
    // rules that didn't go through mergePopulate, e.g. tampered ones embedded into a parcel
    const populate = {schemas: {'*': {}}, channels: {'*': {'*': {schema: '*'}}, npm: {token: {schema: 'missing'}, registry: {schema: 'constructor'}}}}
    expect(check({channel: 'npm', token: '${{NPM_TOKEN}}', registry: 'https://r/'}, env, populate))
      .toEqual(["token: unknown schema 'missing'", "registry: unknown schema 'constructor'"])
  })

  test('a malformed schema is an error, not a crash', () => {
    expect(validateValue('https://github.com/', {type: 'url', port: 443, search: null})).toEqual(['value.port: invalid schema', 'value.search: invalid schema'])
    expect(validateValue('x', null)).toEqual(['value: invalid schema'])
  })

  test('the embedded rules are not checked as a field', () => {
    expect(check({channel: 'npm', token: '${{NPM_TOKEN}}', registry: '${{NPM_REGISTRY}}', populate: strict})).toEqual([])
  })
})
