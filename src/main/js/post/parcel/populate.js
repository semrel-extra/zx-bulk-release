// Populate rules: what manifest fields must look like after `${{VAR}}` substitution.
// Pack embeds them into every manifest, verify checks they match the context, and the courier
// checks the resolved manifests against them right before delivery.
// The default accepts anything, so substitution works as before until the config narrows it.
//
// populate: {
//   schemas:  {name: schema},
//   channels: {[channel | '*']: {[field | '*']: {schema: name}}},
// }
//
// The schema of a field is picked by best match: channel.field → channel.* → *.field → *.*

export const PLACEHOLDER = /\$\{\{(\w+)\}\}/g

export const DEFAULT_POPULATE = {
  schemas:  {'*': {}},
  channels: {'*': {'*': {schema: '*'}}},
}

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

const own = (obj, key) => isObject(obj) && Object.prototype.hasOwnProperty.call(obj, key)

const entriesOf = (obj, at) => {
  if (!isObject(obj)) throw new Error(`${at}: must be an object`)
  if (own(obj, '__proto__')) throw new Error(`${at}: '__proto__' key is not allowed`)
  return Object.entries(obj)
}

const TYPES = new Set(['string', 'secret', 'url'])

const assertSchema = (schema, at) => {
  if (!isObject(schema)) throw new Error(`${at}: must be an object`)
  if (schema.type !== undefined && !TYPES.has(schema.type)) throw new Error(`${at}.type: unknown type '${schema.type}'`)
  if (schema.enum !== undefined && !Array.isArray(schema.enum)) throw new Error(`${at}.enum: must be an array`)
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== 'string') throw new Error(`${at}.pattern: must be a string`)
    try { new RegExp(schema.pattern) } catch { throw new Error(`${at}.pattern: invalid regexp`) }
  }
  if (schema.type === 'url') for (const part of URL_PARTS) {
    const expected = schema[part]
    if (expected === undefined || typeof expected === 'string') continue
    if (!Array.isArray(expected)) assertSchema(expected, `${at}.${part}`)
    else if (!expected.every(v => typeof v === 'string')) throw new Error(`${at}.${part}: must be strings`)
  }
}

// Throws on malformed rules, so a typo can't silently turn into "accept anything". Returns the rules.
export const assertPopulate = (populate, at = 'populate') => {
  entriesOf(populate, at)
  const {schemas = {}, channels = {}} = populate
  for (const [name, schema] of entriesOf(schemas, `${at}.schemas`))
    assertSchema(schema, `${at}.schemas.${name}`)
  for (const [channel, fields] of entriesOf(channels, `${at}.channels`))
    for (const [field, rule] of entriesOf(fields, `${at}.channels.${channel}`)) {
      if (!isObject(rule) || typeof rule.schema !== 'string') throw new Error(`${at}.channels.${channel}.${field}: must be {schema: name}`)
      if (!own(schemas, rule.schema) && !own(DEFAULT_POPULATE.schemas, rule.schema)) throw new Error(`${at}.channels.${channel}.${field}: unknown schema '${rule.schema}'`)
    }

  return populate
}

export const mergePopulate = (populate) => {
  if (populate === undefined || populate === null) populate = {}
  const {schemas, channels} = assertPopulate(populate)
  const merged = JSON.parse(JSON.stringify(DEFAULT_POPULATE))
  Object.assign(merged.schemas, schemas)
  for (const [channel, fields] of Object.entries(channels || {}))
    for (const [field, rule] of Object.entries(fields))
      (merged.channels[channel] ??= {})[field] = {...merged.channels[channel][field], ...rule}

  return merged
}

export const matchSchema = ({channels}, channel, field) =>
  [[channel, field], [channel, '*'], ['*', field], ['*', '*']]
    .map(([c, f]) => own(channels, c) && own(channels[c], f) ? channels[c][f].schema : undefined)
    .find(v => v !== undefined) ?? '*'

// --- schema contract ---
// {}                         any value
// {type: 'string'}           + const / enum / pattern (the pattern must match the whole value)
// {type: 'secret'}           non-empty string
// {type: 'url', ...parts}    absolute URL. A part is matched by a string (exact), an array (one of)
//                            or a nested schema. Parts not described must be empty, except
//                            protocol and hostname, which are not checked unless described.
// Errors name the field and part, never the actual value.

const URL_PARTS = ['protocol', 'username', 'password', 'hostname', 'port', 'pathname', 'search', 'hash']
const ALWAYS_SET = new Set(['protocol', 'hostname'])

const isEmptyPart = (part, value) => value === '' || (part === 'pathname' && value === '/')

const matchPart = (actual, expected, at) =>
  typeof expected === 'string'
    ? actual === expected ? [] : [`${at}: expected ${JSON.stringify(expected)}`]
    : Array.isArray(expected)
      ? expected.includes(actual) ? [] : [`${at}: expected one of ${JSON.stringify(expected)}`]
      : validateValue(actual, expected, at)

const validateUrl = (value, schema, at) => {
  let url
  try { url = new URL(value) } catch { return [`${at}: must be an absolute URL`] }

  return URL_PARTS.flatMap(part => schema[part] === undefined
    ? ALWAYS_SET.has(part) || isEmptyPart(part, url[part]) ? [] : [`${at}.${part}: is not allowed`]
    : matchPart(url[part], schema[part], `${at}.${part}`))
}

export const validateValue = (value, schema = {}, at = 'value') => {
  if (!isObject(schema)) return [`${at}: invalid schema`]
  const {type} = schema

  if (type === 'url') return validateUrl(value, schema, at)
  if (type === 'secret') return typeof value === 'string' && value ? [] : [`${at}: must be a non-empty secret`]
  if (type === 'string' && typeof value !== 'string') return [`${at}: must be a string`]
  if (type !== undefined && type !== 'string') return [`${at}: unknown schema type '${type}'`]

  const errors = []
  if ('const' in schema && value !== schema.const)
    errors.push(`${at}: expected ${JSON.stringify(schema.const)}`)
  if (schema.enum && !schema.enum.includes(value))
    errors.push(`${at}: expected one of ${JSON.stringify(schema.enum)}`)
  if (schema.pattern && !(typeof value === 'string' && new RegExp(`^(?:${schema.pattern})$`).test(value)))
    errors.push(`${at}: does not match ${schema.pattern}`)

  return errors
}

// Checks manifest values (resolved or as packed) against the schemas of their fields.
export const checkManifest = ({values, channel, populate}) =>
  Object.entries(values).flatMap(([field, value]) => {
    if (field === 'populate') return []
    const ref = matchSchema(populate, channel, field)
    return own(populate.schemas, ref) ? validateValue(value, populate.schemas[ref], field) : [`${field}: unknown schema '${ref}'`]
  })
