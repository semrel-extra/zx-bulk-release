import {$} from 'zx'

export const run = async (env = process.env) => {
  await $`echo "hello"`
}
