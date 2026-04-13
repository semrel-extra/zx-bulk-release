import { fs, path, YAML } from 'zx'
import { asArray, camelize, memoizeBy } from './util.js'
import { GH_URL, resolveGhApiUrl } from './post/api/gh.js'
import { DEFAULT_GIT_COMMITTER_NAME, DEFAULT_GIT_COMMITTER_EMAIL } from './post/api/git.js'

const CONFIG_NAME = 'release'
const CONFIG_FILES = [
  'package.json',
  `.${CONFIG_NAME}rc`,
  `.${CONFIG_NAME}rc.json`,
  `.${CONFIG_NAME}rc.yaml`,
  `.${CONFIG_NAME}rc.yml`,
  `.${CONFIG_NAME}rc.js`,
  `.${CONFIG_NAME}rc.cjs`,
  `${CONFIG_NAME}.config.js`,
  `${CONFIG_NAME}.config.cjs`
]

export const defaultConfig = {
  cmd:        'exit 0',
  changelog:  'changelog',
  npmFetch:   true,
  ghRelease:  true,
  meta:       true,
  // npmPublish: true,
  // ghPages: 'gh-pages'
}

export const getPkgConfig = async (cwd, env) =>
  normalizePkgConfig((await Promise.all(asArray(cwd).map(readPkgConfig))).find(Boolean) || defaultConfig, env)

export const cosmiconfig = (name, {searchPlaces}) => {
  const load = async (filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.cjs'))
      return (await import(filePath)).default
    const raw = await fs.readFile(filePath, 'utf8')
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml'))
      return YAML.parse(raw)
    try { return JSON.parse(raw) } catch { return YAML.parse(raw) }
  }

  const search = async (cwd) => {
    let dir = path.resolve(cwd)
    while (true) {
      for (const file of searchPlaces) {
        const filePath = path.resolve(dir, file)
        if (!await fs.pathExists(filePath)) continue
        if (file === 'package.json') {
          const pkg = await fs.readJson(filePath)
          if (pkg[name]) return pkg[name]
          continue
        }
        return load(filePath)
      }
      const parent = path.dirname(dir)
      if (parent === dir) return
      dir = parent
    }
  }

  return {search}
}

export const readPkgConfig = memoizeBy(async (cwd) =>
  cosmiconfig(CONFIG_NAME, {searchPlaces: CONFIG_FILES}).search(cwd)
)

export const normalizePkgConfig = (config, env) => {
  const envConfig = parseEnv(env)
  return {
    ...envConfig,
    ...config,
    releaseRules: config.releaseRules || config.semanticRules,
    npmFetch:     config.npmFetch || config.fetch || config.fetchPkg,
    buildCmd:     config.buildCmd || config.cmd,
    get ghBasicAuth() {
      return this.ghUser && this.ghToken ? `${this.ghUser}:${this.ghToken}` : false
    },
    meta: normalizeMetaConfig(config.meta || envConfig.ghMeta)
  }
}

export const normalizeMetaConfig = (meta) =>
  meta === false || meta === 'none'
    ? { type: null }
    : meta === true
      ? normalizeMetaConfig('commit')
      : typeof meta === 'string'
        ? { type: meta } // 'commit' | 'asset' | 'tag'
        : { type: null }

export const parseEnv = ({GH_USER, GH_USERNAME, GH_META, GH_URL: _GH_URL, GITHUB_URL, GITHUB_USER, GITHUB_USERNAME, GH_TOKEN, GITHUB_TOKEN, NPM_TOKEN, NPM_REGISTRY, NPMRC, NPM_USERCONFIG, NPM_CONFIG_USERCONFIG, NPM_PROVENANCE, NPM_OIDC, ACTIONS_ID_TOKEN_REQUEST_URL, GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL} = process.env) => {
  const ghUrl = _GH_URL || GITHUB_URL || GH_URL
  return {
    ghUser:             GH_USER || GH_USERNAME || GITHUB_USER || GITHUB_USERNAME || ((GH_TOKEN || GITHUB_TOKEN) ? 'x-access-token' : undefined),
    ghToken:            GH_TOKEN || GITHUB_TOKEN,
    ghUrl,
    ghApiUrl:           resolveGhApiUrl(ghUrl),
    ghMeta:             GH_META,
    npmConfig:          NPMRC || NPM_USERCONFIG || NPM_CONFIG_USERCONFIG,
    npmToken:           NPM_TOKEN,
    npmProvenance:      NPM_PROVENANCE,
    npmOidc:            NPM_OIDC || (!NPM_TOKEN && ACTIONS_ID_TOKEN_REQUEST_URL),
    npmRegistry:        NPM_REGISTRY || 'https://registry.npmjs.org',
    gitCommitterName:   GIT_COMMITTER_NAME || DEFAULT_GIT_COMMITTER_NAME,
    gitCommitterEmail:  GIT_COMMITTER_EMAIL || DEFAULT_GIT_COMMITTER_EMAIL,
  }
}

export const normalizeFlags = (flags = {}) => Object.entries(flags).reduce((acc, [k, v]) => ({...acc, [camelize(k)]: v}), {})
