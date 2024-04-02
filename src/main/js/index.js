import process from 'node:process'
import { $ } from 'zx-extra'

$.quiet = !process.env.DEBUG
$.verbose = !!process.env.DEBUG

export {run} from './processor/release.js'
