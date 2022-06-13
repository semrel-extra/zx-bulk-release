import {$, ctx, semver} from 'zx-extra'

export { topo } from '@semrel-extra/topo'

export const run = async (env = process.env) => {
  await $`echo "hello"`
}

export const getPkgCommits = async (cwd, since) => ctx(async ($) => {
  $.cwd = cwd

  const range = since ? `${since}..HEAD` : 'HEAD'

  return (await $.raw`git log ${range} --format=+++%s__%b__%h__%H -- .`)
    .toString()
    .split('+++')
    .filter(Boolean)
    .map(msg => {
      const [subj, body, short, hash] = msg.split('__').map(raw => raw.trim())
      return {subj, body, short, hash}
    })
})

export const parseTag = tag => {
  if (!semver.valid(tag)) return null

  const pattern = /^(\d{4}\.(?:[1-9]|1[012])\.(?:0[1-9]|[12]\d|30|31))-((?:[0-9-a-z]+\.)?[0-9-a-z]+)\.(.+)$/
  const matched = pattern.exec(tag)

  if (!matched ) return null

  const [, _date, _name, version] = matched

  if (!semver.valid(version)) return null

  const date = new Date(_date.replaceAll('.', '-')+'Z')
  const name = _name.includes('.') ? `@${_name.replace('.', '/')}` : _name

  return {date, name, version}
}

export const formatTag = ({name, date = new Date(), version}) => {
  const d = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`
  const n = name.replace('@', '').replace('/', '.')

  return `${d}-${n}.${version}`
}
