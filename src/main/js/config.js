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
  buildCmd: 'yarn build',
  postbuildCmd: 'yarn install',
  testCmd: 'yarn test',
  fetch: true
}

export const getConfig = async (...cwds) =>
  (await Promise.all(cwds.map(
    cwd => cosmiconfig(CONFIG_NAME, { searchPlaces: CONFIG_FILES }).search(cwd).then(r => r?.config)
  ))).find(Boolean) || defaultConfig

