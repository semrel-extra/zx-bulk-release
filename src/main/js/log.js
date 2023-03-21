import {$} from 'zx-extra'

export const log = (ctx) => {
  if ($.state) {
    return $.state.log(ctx)
  }

  return console.log
}
