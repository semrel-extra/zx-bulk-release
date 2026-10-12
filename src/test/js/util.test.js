import {describe, test, expect} from 'vitest'
import {$, within, sleep} from 'zx-extra'
import {tpl, get, set, queuefy, keyedQueue, pool} from '../../main/js/util.js'

describe('util', () => {
  test('tpl()', () => {
    const cases = [
      [
        'echo "custom publish: ${{name}} ${{ version }} ${{ context.foo.bar }}"',
        {
          name: 'foo',
          version: '1.0.0',
          context: {
            foo: {
              bar: 'baz'
            }
          }
        },
        'echo "custom publish: foo 1.0.0 baz"'],
      [
        'echo "custom publish: ${{name}} ${{version}}"',
        {},
        'echo "custom publish:  "'
      ],
    ]

    cases.forEach(([template, ctx, result]) => {
      expect(tpl(template, ctx)).toEqual(result)
    })
  })

  test('set/get()', () => {
    const obj = {arr: [{}]}

    set(obj, 'foo.bar', 'baz')
    set(obj, 'arr.0.name', 'name')
    expect(get(obj, 'foo.bar')).toEqual('baz')
    expect(get(obj, 'arr.0.name')).toEqual('name')
    expect(get(obj, '.')).toEqual(obj)
    expect(get(obj)).toEqual(obj)
  })

  test('queuefy() limits concurrency to 1 by default', async () => {
    const order = []
    const fn = queuefy(async (id, ms) => {
      order.push(`start:${id}`)
      await new Promise(r => setTimeout(r, ms))
      order.push(`end:${id}`)
      return id
    })

    const [a, b, c] = await Promise.all([fn('a', 30), fn('b', 10), fn('c', 10)])
    expect(a).toBe('a')
    expect(b).toBe('b')
    expect(c).toBe('c')
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c'])
  })

  test('queuefy() respects custom concurrency', async () => {
    let active = 0
    let maxActive = 0
    const fn = queuefy(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 20))
      active--
    }, 3)

    await Promise.all(Array.from({length: 9}, () => fn()))
    expect(maxActive).toBe(3)
  })

  test('queuefy() propagates errors without stalling the queue', async () => {
    const fn = queuefy(async (v) => {
      if (v === 'bad') throw new Error('boom')
      return v
    })

    const results = await Promise.allSettled([fn('ok'), fn('bad'), fn('after')])
    expect(results[0]).toEqual({status: 'fulfilled', value: 'ok'})
    expect(results[1].status).toBe('rejected')
    expect(results[2]).toEqual({status: 'fulfilled', value: 'after'})
  })

  test('queuefy() runs each call in its caller async context', async () => {
    const seen = []
    const fn = queuefy(async (name) => {
      await sleep(5)
      seen.push(`${name}:${$.scope}`)
    })

    await Promise.all(['a', 'b', 'c'].map(name => within(() => {
      $.scope = name
      return fn(name)
    })))
    expect(seen).toEqual(['a:a', 'b:b', 'c:c'])
  })

  test('keyedQueue() runs tasks one at a time per key', async () => {
    const lock = keyedQueue()
    const events = []
    const task = (id, ms) => async () => {
      events.push(`+${id}`)
      await sleep(ms)
      events.push(`-${id}`)
      return id
    }

    const results = await Promise.all([lock('a', task('a1', 20)), lock('a', task('a2', 1)), lock('b', task('b1', 5))])
    expect(results).toEqual(['a1', 'a2', 'b1'])
    expect(events).toEqual(['+a1', '+b1', '-b1', '-a1', '+a2', '-a2'])
  })

  test('pool() runs tasks with concurrency limit', async () => {
    let active = 0
    let maxActive = 0
    const results = []

    await pool([1, 2, 3, 4, 5], 2, async (n) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 10))
      results.push(n)
      active--
    })

    expect(maxActive).toBeLessThanOrEqual(2)
    expect(results.sort()).toEqual([1, 2, 3, 4, 5])
  })

})
