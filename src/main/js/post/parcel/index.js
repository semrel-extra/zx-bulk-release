export {buildParcels, sanitizePkgName} from './build.js'
export {buildDirective, parseDirective, scanDirectives, invalidateOrphans, parcelChannel} from './directive.js'
export {verifyParcels, verifyManifests} from './verify.js'
export {DEFAULT_POPULATE, mergePopulate, matchSchema, validateValue, checkManifest} from './populate.js'
import {path} from 'zx-extra'

export const PARCELS_DIR = 'parcels'

// Where pack puts parcels and their directive: one place, relative to the repo root.
export const parcelsDir = (root, flags) => path.resolve(root, typeof flags.pack === 'string' ? flags.pack : PARCELS_DIR)
