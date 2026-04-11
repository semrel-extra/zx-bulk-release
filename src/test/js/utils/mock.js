import {PassThrough} from 'node:stream'
import {EventEmitter} from 'node:events'
import {tempy} from 'zx-extra'

export const tmpDir = tempy.temporaryDirectory()

function proc(stdout = '', code = 0) {
  const p = new EventEmitter()
  p.stdout = new PassThrough()
  p.stderr = new PassThrough()
  p.stdin = new PassThrough()
  p.pid = 1
  process.nextTick(() => {
    p.stdout.end(stdout)
    p.stderr.end('')
    p.emit('close', code, null)
    p.emit('exit', code, null)
  })
  return p
}

export function createMock(responses = []) {
  const calls = []
  const spawn = (cmd, args) => {
    const command = args?.[args.length - 1] || cmd
    calls.push(command)
    for (const [pattern, output, code] of responses) {
      if (typeof pattern === 'string' ? command.includes(pattern) : pattern.test(command))
        return proc(output, code ?? 0)
    }
    return proc('')
  }
  return {spawn, calls}
}

export const has = (calls, pattern) =>
  calls.some(c => typeof pattern === 'string' ? c.includes(pattern) : pattern.test(c))

export const gitResponses = (overrides = {}) => [
  ['git rev-parse --show-toplevel', overrides.root ?? tmpDir],
  ['git rev-parse HEAD', overrides.sha ?? 'abc1234567890'],
  ['git config --get remote.origin.url', overrides.origin ?? 'https://github.com/test-org/test-repo.git'],
  ['git tag -l', overrides.tags ?? ''],
  [/git log .+--format/, overrides.log ?? ''],
  ['git config user.name', ''],
  ['git config user.email', ''],
  [/git tag -m/, ''],
  ['git push', ''],
  ['git fetch', ''],
  ['git clone', ''],
  ['git init', ''],
  ['git add', ''],
  ['git commit', ''],
  [/git remote/, ''],
  [/git config --unset/, ''],
]

export const npmResponses = (overrides = {}) => [
  ['npm --version', overrides.npmVersion ?? '10.0.0'],
  ['npm publish', ''],
  ['npm view', overrides.view ?? ''],
]

export const defaultResponses = (overrides = {}) => [
  ...gitResponses(overrides),
  ...npmResponses(overrides),
  [/curl/, overrides.curl ?? '{}'],
  [/echo/, ''],
]

export const makePkg = (overrides = {}) => ({
  name: overrides.name ?? 'test-pkg',
  version: overrides.version ?? '1.0.1',
  absPath: overrides.absPath ?? `${tmpDir}/packages/test-pkg`,
  relPath: overrides.relPath ?? 'packages/test-pkg',
  manifest: {
    name: overrides.name ?? 'test-pkg',
    version: overrides.version ?? '1.0.1',
    private: overrides.private ?? false,
    ...overrides.manifest,
  },
  config: {
    buildCmd: 'echo build',
    testCmd: 'echo test',
    gitCommitterName: 'Bot',
    gitCommitterEmail: 'bot@test.com',
    ghBasicAuth: 'x-access-token:ghp_test',
    ghToken: 'ghp_test',
    npmPublish: true,
    npmFetch: false,
    changelog: 'changelog',
    ...overrides.config,
  },
  changes: overrides.changes ?? [{group: 'Fixes', releaseType: 'patch', change: 'fix: test'}],
  releaseType: overrides.releaseType ?? 'patch',
  tag: overrides.tag ?? '2026.1.1-test-pkg.1.0.1-f0',
  latest: overrides.latest ?? {tag: null, meta: null},
  ctx: overrides.ctx ?? null,
  ...overrides.extra,
})

export const makeCtx = (overrides = {}) => ({
  cwd: overrides.cwd ?? tmpDir,
  env: {PATH: process.env.PATH, HOME: process.env.HOME, GH_TOKEN: 'ghp_test', NPM_TOKEN: 'npm_test', ...overrides.env},
  flags: {build: true, test: true, publish: true, ...overrides.flags},
  root: {absPath: tmpDir, ...overrides.root},
  packages: overrides.packages ?? {},
  queue: overrides.queue ?? [],
  prev: overrides.prev ?? {},
  graphs: overrides.graphs ?? {},
  report: overrides.report ?? makeReport(),
  channels: overrides.channels ?? [],
  run: overrides.run ?? (async () => {}),
  git: {sha: 'abc1234567890', root: tmpDir, ...overrides.git},
})

export const makeReport = () => {
  const events = []
  return {
    status: 'initial',
    events,
    packages: {},
    log(...chunks) { events.push({level: 'info', msg: chunks}); return this },
    warn(...chunks) { events.push({level: 'warn', msg: chunks}); return this },
    error(...chunks) { events.push({level: 'error', msg: chunks}); return this },
    set() { return this },
    get() { return this },
    setStatus() { return this },
    getStatus() { return this },
    save() { return this },
  }
}
