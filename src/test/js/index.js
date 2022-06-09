import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {fileURLToPath} from "node:url"
import path from "node:path"
import {tempy} from 'zx-extra'
import {ctx} from 'zx/experimental'

import {run} from '../../main/js/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.resolve(__dirname, '../fixtures')

test('index has proper exports', () => {
  assert.instance(run, Function)
})

test('run: dry-run', async () => {
  await run()
})

const createFakeRepo = async ({cwd = tempy(), commits}) => {
  await ctx(async ($) => {
    $.cwd = cwd

    await $``

    return $.cwd
  })
}

test.run()
