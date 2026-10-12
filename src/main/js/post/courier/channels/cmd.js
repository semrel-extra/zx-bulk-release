import {api} from '../../api/index.js'

export default {
  name: 'cmd',
  when: (pkg) => !!(pkg.ctx?.flags?.publishCmd ?? pkg.config.publishCmd),
  // After the release tag publishCmd commits and tags as the release, as when zbr kept this identity in the repo config.
  // A snapshot pushes no tag, so there the command runs with the user's own identity, as before.
  run:  (pkg, exec) => exec(pkg, 'publishCmd', pkg.ctx?.flags?.snapshot ? undefined : api.git.identity()),
  snapshot: true,
  transport: false,
}
