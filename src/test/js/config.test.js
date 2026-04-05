import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {parseEnv} from '../../main/js/config.js'

const test = suite('config')

test('parseEnv() sets npmOidc from NPM_OIDC', () => {
  const config = parseEnv({NPM_OIDC: 'true'})
  assert.ok(config.npmOidc)
})

test('parseEnv() auto-detects npmOidc when no NPM_TOKEN and ACTIONS_ID_TOKEN_REQUEST_URL present', () => {
  const config = parseEnv({
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.githubusercontent.com'
  })
  assert.ok(config.npmOidc)
})

test('parseEnv() does not set npmOidc when NPM_TOKEN is present', () => {
  const config = parseEnv({
    NPM_TOKEN: 'some-token',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.githubusercontent.com'
  })
  assert.ok(!config.npmOidc)
})

test('parseEnv() does not set npmOidc when neither NPM_OIDC nor ACTIONS_ID_TOKEN_REQUEST_URL', () => {
  const config = parseEnv({})
  assert.ok(!config.npmOidc)
})

test('parseEnv() NPM_OIDC overrides NPM_TOKEN presence', () => {
  const config = parseEnv({
    NPM_OIDC: 'true',
    NPM_TOKEN: 'some-token'
  })
  assert.ok(config.npmOidc)
})

test.run()
