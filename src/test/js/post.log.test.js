import {suite} from 'uvu'
import * as assert from 'uvu/assert'
import {$, within} from 'zx-extra'
import {redact, log, createReport} from '../../main/js/post/log.js'

const test = suite('post.log')

test('redact masks registered secrets', () => {
  log.secret('supersecret123')
  assert.is(redact('token=supersecret123'), 'token=***')
  assert.is(redact('no secret here'), 'no secret here')
  assert.is(redact(42), 42)
})

test('createReport returns chainable report', () => {
  const logs = []
  const logger = {log: (...a) => logs.push(a), warn: (...a) => logs.push(a), error: (...a) => logs.push(a)}
  const report = createReport({
    logger,
    packages: {
      a: {manifest: {version: '1.0.0'}, absPath: '/a', relPath: 'a'},
    },
    queue: ['a'],
    flags: {},
  })

  assert.is(report.status, 'initial')
  assert.is(report.packages.a.name, 'a')
  assert.is(report.packages.a.version, '1.0.0')

  // chaining
  const ret = report.log('hello').warn('warning').error('err')
  assert.is(ret, report)
  assert.is(report.events.length, 3)
  assert.is(report.events[0].level, 'info')
  assert.is(report.events[1].level, 'warn')
  assert.is(report.events[2].level, 'error')
})

test('report.set / report.get', () => {
  const report = createReport({
    packages: {a: {manifest: {version: '1.0.0'}, absPath: '/a', relPath: 'a'}},
    queue: ['a'],
    flags: {},
  })

  report.set('foo', 'bar')
  assert.is(report.get('foo'), 'bar')

  report.set('version', '2.0.0', 'a')
  assert.is(report.get('version', 'a'), '2.0.0')

  // batch set
  report.set({x: 1, y: 2}, 'a')
  assert.is(report.packages.a.x, 1)
  assert.is(report.packages.a.y, 2)
})

test('report.setStatus persists status', () => {
  const report = createReport({
    packages: {a: {manifest: {version: '1.0.0'}, absPath: '/a', relPath: 'a'}},
    queue: ['a'],
    flags: {},
  })

  const ret = report.setStatus('building', 'a')
  assert.is(ret, report)
  assert.is(report.packages.a.status, 'building')
})

test('log.info/warn/error delegate to $.report when set', async () => {
  await within(async () => {
    const events = []
    $.report = {
      log: (...args) => events.push({level: 'info', args}),
      warn: (...args) => events.push({level: 'warn', args}),
      error: (...args) => events.push({level: 'error', args}),
    }

    log.info('hello')
    log.warn('careful')
    log.error('oops')

    assert.is(events.length, 3)
    assert.is(events[0].level, 'info')
    assert.is(events[1].level, 'warn')
    assert.is(events[2].level, 'error')

    $.report = undefined
  })
})

test.run()
