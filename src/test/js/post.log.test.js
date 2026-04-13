import {describe, test, expect} from 'vitest'
import {$, within} from 'zx-extra'
import {redact, log, createReport} from '../../main/js/post/log.js'

describe('post.log', () => {
  test('redact masks registered secrets', () => {
    log.secret('supersecret123')
    expect(redact('token=supersecret123')).toBe('token=***')
    expect(redact('no secret here')).toBe('no secret here')
    expect(redact(42)).toBe(42)
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

    expect(report.status).toBe('initial')
    expect(report.packages.a.name).toBe('a')
    expect(report.packages.a.version).toBe('1.0.0')

    // chaining
    const ret = report.log('hello').warn('warning').error('err')
    expect(ret).toBe(report)
    expect(report.events.length).toBe(3)
    expect(report.events[0].level).toBe('info')
    expect(report.events[1].level).toBe('warn')
    expect(report.events[2].level).toBe('error')
  })

  test('report.set / report.get', () => {
    const report = createReport({
      packages: {a: {manifest: {version: '1.0.0'}, absPath: '/a', relPath: 'a'}},
      queue: ['a'],
      flags: {},
    })

    report.set('foo', 'bar')
    expect(report.get('foo')).toBe('bar')

    report.set('version', '2.0.0', 'a')
    expect(report.get('version', 'a')).toBe('2.0.0')

    // batch set
    report.set({x: 1, y: 2}, 'a')
    expect(report.packages.a.x).toBe(1)
    expect(report.packages.a.y).toBe(2)
  })

  test('report.setStatus persists status', () => {
    const report = createReport({
      packages: {a: {manifest: {version: '1.0.0'}, absPath: '/a', relPath: 'a'}},
      queue: ['a'],
      flags: {},
    })

    const ret = report.setStatus('building', 'a')
    expect(ret).toBe(report)
    expect(report.packages.a.status).toBe('building')
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

      expect(events.length).toBe(3)
      expect(events[0].level).toBe('info')
      expect(events[1].level).toBe('warn')
      expect(events[2].level).toBe('error')

      $.report = undefined
    })
  })

})
