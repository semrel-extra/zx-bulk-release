import { cosmiconfig } from 'cosmiconfig'
import { asArray, camelize, memoizeBy } from './util.js'

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

export const readPkgConfig = memoizeBy(async (cwd) => cosmiconfig(CONFIG_NAME, {
  searchPlaces: CONFIG_FILES,
  searchStrategy: 'global', // https://github.com/cosmiconfig/cosmiconfig/releases/tag/v9.0.0
})
  .search(cwd)
  .then(r => r?.config))

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
  meta === true
    ? normalizeMetaConfig('commit')
    : typeof meta === 'string'
      ? { type: meta } // 'commit' | 'asset' | 'tag'
      : { type: 'none' }

export const parseEnv = ({GH_USER, GH_USERNAME, GH_META, GITHUB_USER, GITHUB_USERNAME, GH_TOKEN, GITHUB_TOKEN, NPM_TOKEN, NPM_REGISTRY, NPMRC, NPM_USERCONFIG, NPM_CONFIG_USERCONFIG, NPM_PROVENANCE, GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL} = process.env) =>
  ({
    ghUser:             GH_USER || GH_USERNAME || GITHUB_USER || GITHUB_USERNAME,
    ghToken:            GH_TOKEN || GITHUB_TOKEN,
    ghMeta:             GH_META,
    npmConfig:          NPMRC || NPM_USERCONFIG || NPM_CONFIG_USERCONFIG,
    npmToken:           NPM_TOKEN,
    npmProvenance:      NPM_PROVENANCE,
    npmRegistry:        NPM_REGISTRY || 'https://registry.npmjs.org',
    gitCommitterName:   GIT_COMMITTER_NAME || 'Semrel Extra Bot',
    gitCommitterEmail:  GIT_COMMITTER_EMAIL || 'semrel-extra-bot@hotmail.com',
  })

export const normalizeFlags = (flags = {}) => Object.entries(flags).reduce((acc, [k, v]) => ({...acc, [camelize(k)]: v}), {})
