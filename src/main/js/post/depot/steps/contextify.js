import {getPkgConfig} from '../../../config.js'
import {getLatest} from '../generators/meta.js'
import {getRoot, getSha, getCommitTimestamp} from '../../api/git.js'

/**
 * Global release context — one per `run()` invocation.
 * Built by `createContext()` in release.js and extended with runtime bits (run, publishers).
 *
 * @typedef {object} ReleaseContext
 * @property {object}                 flags       CLI flags (build, test, publish, snapshot, dryRun, pack, deliver, ...).
 * @property {Record<string,string>}  env         Resolved process env (process.env merged with per-run overrides).
 * @property {string}                 cwd         Repo working directory.
 * @property {object}                 root        Root package descriptor (from topo()).
 * @property {Record<string,object>}  packages    All discovered packages keyed by name.
 * @property {string[]}               queue       Topologically sorted release order.
 * @property {Record<string,string[]>} prev       Per-package predecessor map.
 * @property {object}                 graphs      Dependency graphs.
 * @property {object}                 report      Run-wide status/report sink.
 * @property {(pkg, name) => Promise} run         Concurrency-limited shell exec (queuefy'd).
 * @property {object[]}               publishers  Ordered publisher registry.
 */

/**
 * Per-package release context — refines {@link ReleaseContext} for a single package scope.
 * Inherits all shared fields from the global ctx via prototype chain; only stores
 * package-local state (git sha/root/tag) as own properties.
 *
 * @typedef {ReleaseContext & {git: {sha: string, root: string, tag?: string}}} PkgContext
 */

/**
 * Attach per-package state to `pkg` and build its refined context.
 * Inspired by https://docs.github.com/en/actions/learn-github-actions/contexts
 *
 * @param {object} pkg  Package descriptor (mutated: config, latest, context are set).
 * @param {ReleaseContext} ctx
 */
export const contextify = async (pkg, ctx) => {
  if (pkg.ctx) return
  pkg.config = await getPkgConfig([pkg.absPath, ctx.root.absPath], ctx.env)
  pkg.latest = await getLatest(pkg)
  pkg.ctx = {
    ...ctx,
    git: {
      sha: await getSha(ctx.cwd),
      root: await getRoot(ctx.cwd),
      timestamp: await getCommitTimestamp(ctx.cwd),
    },
  }
}
