import {$, within} from 'zx-extra'
import {memoizeBy} from '../util.js'
import {exec} from '../processor/exec.js'
// import {traverseDeps} from "../processor/deps.js";

export const test = memoizeBy(async (pkg, run = exec, flags = {}, self = test) => within(async () => {
  $.scope = pkg.name

  // await traverseDeps({pkg, packages: pkg.context.packages, cb: async({pkg}) => self(pkg, run, flags, self)})

  if (!pkg.fetched) {
    await run(pkg, 'testCmd')
  }

  pkg.tested = true
}))
