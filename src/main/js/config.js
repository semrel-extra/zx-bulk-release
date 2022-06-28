import { cosmiconfig } from 'cosmiconfig'

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
  cmd: 'yarn && yarn build && yarn test',
  npmFetch: true,
  changelog: 'changelog',
  ghRelease: true,
  // npmPublish: true,
  // ghPages: 'gh-pages'
}

export const getConfig = async (...cwds) =>
  normalizeConfig((await Promise.all(cwds.map(
    cwd => cosmiconfig(CONFIG_NAME, { searchPlaces: CONFIG_FILES }).search(cwd).then(r => r?.config)
  ))).find(Boolean) || defaultConfig)

export const normalizeConfig = config => ({
  ...config,
  npmFetch: config.npmFetch || config.fetch || config.fetchPkg,
  cmd:      config.cmd || (config.buildCmd ? `${config.buildCmd}${config.testCmd ? ` && ${config.testCmd}` : ''}` : '')
})

export const parseEnv = (env = process.env) => {
  const {GH_USER, GH_USERNAME, GITHUB_USER, GITHUB_USERNAME, GH_TOKEN, GITHUB_TOKEN, NPM_TOKEN, NPM_REGISTRY, NPMRC, NPM_USERCONFIG, NPM_CONFIG_USERCONFIG, GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL} = env

  return {
    ghUser:             GH_USER || GH_USERNAME || GITHUB_USER || GITHUB_USERNAME,
    ghToken:            GH_TOKEN || GITHUB_TOKEN,
    npmConfig:          NPMRC || NPM_USERCONFIG || NPM_CONFIG_USERCONFIG,
    npmToken:           NPM_TOKEN,
    npmRegistry:        NPM_REGISTRY || 'https://registry.npmjs.org',
    gitCommitterName:   GIT_COMMITTER_NAME || 'Semrel Extra Bot',
    gitCommitterEmail:  GIT_COMMITTER_EMAIL || 'semrel-extra-bot@hotmail.com',
  }
}
