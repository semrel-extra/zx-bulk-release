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
  ghPages: 'gh-pages'
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
