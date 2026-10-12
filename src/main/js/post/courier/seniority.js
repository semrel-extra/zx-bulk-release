import {semver} from 'zx-extra'
import {api} from '../api/index.js'
import {parseTag} from '../depot/generators/tag.js'

export const hasHigherVersion = async (cwd, name, version) =>
  (await api.git.listRemoteTags(cwd)).some(ref => {
    const tag = parseTag(ref)
    return tag?.name === name && !!semver.valid(tag.version) && semver.gt(tag.version, version)
  })
