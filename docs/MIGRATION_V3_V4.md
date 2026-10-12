# Upgrading v3 → v4

## TL;DR

v4 is a drop-in upgrade: no config, flag or workflow changes — unless a later workflow step relied on the git identity v3 left in `.git/config` (see 10). Delivery was rebuilt — one executor for every pipeline mode, git owned by one module, verify bound to the trusted context — and v4 ships as a major to flag the size of that change, not to break setups. Keep every phase of a pipeline on the same zbr version, as before.

## Failures that used to pass silently

These were green in v3 while something was wrong. v4 fails the run instead:

- **npm 403.** An auth, 2FA or permission error counted as "already published": the parcel was marked delivered and nothing went out. Now a failed publish is a duplicate only on `EPUBLISHCONFLICT` / "cannot publish over", or when the registry has the version.
- **gh-release validation errors** other than an existing release (an invalid tag, notes over the size limit) counted as duplicates.
- **A rejected tag push** (branch protection, a ruleset, a hook, no access) counted as a version conflict and triggered a rebuild, which hit the same wall. Now it is an error.
- **A failed lock push** (no access, no network) read as "locked by another process": nothing was delivered and the job was green.
- **Errors raced ahead.** On the first error the lock was released while other packages were still being delivered, and every later error was lost. Now everything in flight finishes, the lock goes, and all errors are reported.
- **`--dry-run`** pushed and deleted the lock tag, wrote orphan markers and marked the directive `released`, so the next real run delivered without it. Now it plans only.
- **Docs seniority** never worked: the check ran outside the repo and always found no newer version. Now `meta`, `changelog` and `gh-pages` skip a version older than one already released, as documented.
- **Verify** accepted parcels that a compromised pack could abuse: a claim at another commit, a snapshot published as `latest`, an npm tarball with a second `package.json` that npm would publish instead, a directive dropping a dependency or a package's claim. See [SECURITY.md](./SECURITY.md).

## Behaviour that changed on purpose

1. **Delivery order.** A package's channels go in stages: claim (`git-tag`) → publish (`npm`) → announce (`gh-release`, `meta`, `changelog`, `gh-pages`). In v3 a directive ran npm last, after every git channel, and a delivery without one (all-in-one) went channel by channel with npm third. npm now follows the claim: in all-in-one a re-run skips a package whose tag is already ours, so a failed announcement must not cost the npm release.
2. **Claim before act.** Nothing else of a package goes out until its release tag is ours (snapshots have none). In v3, all-in-one published to npm even after losing the tag, and with a directive the announcements ran alongside the claim.
3. **Dependents of a lost claim** wait for the rebuild with their own parcels marked `conflict`. In v3 they went out, depending on a version another commit owns.
4. **Parcels without credentials** are never overwritten with `skip`: they stay valid tarballs, as documented. v4 still reads `skip` markers written by v3.
5. **Without a directive**, a parcel that can't be tied to a package (unreadable, or no name and version in its manifest) stops the delivery. pack never writes such parcels.
6. **A directive marked `released` or `conflict`** never sends its leftover parcels out without it. v3 delivered them as if there were no directive. After a conflict the rebuild delivers.
7. **Markers on a claim** count for what the remote says, with a directive. If the tag of a claim marked `released` is gone from the remote, the delivery fails instead of trusting the marker.
8. **Verify** fails a directive that holds back a dependency of a package it lists (for example `--ignore` of a dependency in pack only). v3 released the dependent pinned to a version that was never published.
9. **Error text** for parcels that are not delivered: `N invalid parcel(s) not delivered, see the warnings above` (was `populate rules: N parcel(s) not delivered`).
10. **Git identity.** zbr no longer writes or deletes `user.name` / `user.email` in your repo config:
    - `publishCmd` runs with the release identity in its env — `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL`, or the default bot — unless your env sets `GIT_AUTHOR_*` / `GIT_COMMITTER_*`; not in snapshot mode, where v3 set none either. To commit as someone else there, set those env vars: `git config user.*` and `-c` don't win over env.
    - `buildCmd` and `testCmd` get your env unchanged.
    - Tools that read the identity from `.git/config` only (isomorphic-git, older libgit2) need their own `git config user.*`.
    - After `--deliver` in a job with a checkout, later steps that commit need their own identity: v3 left the bot's in `.git/config`.
    - Your own repo-level `user.name` is no longer wiped after a run.
11. **Lock and rebuild tags** point at the release commit. v3 used the checkout's HEAD — or, without a checkout, an empty commit it pushed to the remote, so a rebuild checked out an empty tree.
12. **The directive** is written next to the parcels, under the repo root. v3 wrote it relative to the working dir, which split them apart in a monorepo below the git root.
13. **The context** written by `--receive` gains `prev` (dependencies between the released packages) and `snapshot`. Verify checks them when present.

## For custom channel code

Channels aren't a public API, but if you patch the `channels` registry:

- `run(manifest, dir, {gitRoot})` — `gitRoot` is the delivery repo. The `git-tag` manifest no longer carries `cwd`.
- `stage: 'claim' | 'publish' | 'announce'`. A channel without a stage runs in `publish`.
- Return `'ok'`, `'duplicate'` or `'conflict'`; throw anything else.
