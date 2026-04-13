import * as git from './git.js'
import * as gh from './gh.js'
import * as npm from './npm.js'

export const api = { git, gh, npm }

/** @deprecated use `api` */
export const defaultApi = api
