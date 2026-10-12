import {describe, test, expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {fs, path, glob} from 'zx-extra'

describe('architecture', () => {
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../main/js')

  // One owner per local repo: the per-repo lock and the identity live there, so nothing may go around them.
  test('git runs only in api/git.js', async () => {
    const files = await glob('**/*.js', {cwd: src})
    const others = files.filter(f => f !== 'post/api/git.js')
    const offenders = []
    for (const f of others) if (/`\s*git\s/.test(await fs.readFile(path.join(src, f), 'utf8'))) offenders.push(f)

    expect(files).toContain('post/api/git.js')
    expect(offenders).toEqual([])
  })
})
