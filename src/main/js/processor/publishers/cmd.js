export default {
  name: 'cmd',
  when: (pkg) => !!(pkg.context?.flags?.publishCmd ?? pkg.config.publishCmd),
  run:  (pkg, exec) => exec(pkg, 'publishCmd'),
  snapshot: true,
}
