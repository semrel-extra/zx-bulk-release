import {memoizeBy} from '../../util.js'
import {exec} from '../exec.js'

export const test = memoizeBy(async (pkg, ctx) => {
  const {run = exec} = ctx
  if (!pkg.fetched) {
    await run(pkg, 'testCmd')
  }
  pkg.tested = true
})
