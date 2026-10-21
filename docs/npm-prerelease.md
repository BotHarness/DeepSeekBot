# Releasing DeepSeekBot to npm

This is the operator path for publishing DeepSeekBot to npm. It grew out of #866, the
packaged qualification in [#823](https://github.com/BotHarness/BotHarness/issues/823) and the
real Lark onboarding in [#824](https://github.com/BotHarness/BotHarness/issues/824); it does not
deploy the website.

## Packages

A release publishes these precompiled packages in this order:

1. `@botharness/im-provider` — independent Provider version (for example `4.32.0-botharness.5`);
2. `@botharness/core@<version>`;
3. `@botharness/ui@<version>`;
4. `@botharness/cloudflared-<platform>-<arch>@<version>` — one optional package per platform
   (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-x64`) carrying the pinned
   `cloudflared` for Connect (ADR-0241), in the esbuild pattern;
5. `deepseekbot@<version>` — one product Bundle with exact dependencies, listing the
   `cloudflared` packages as exact `optionalDependencies` so npm installs only the matching one.

`prepare` downloads the `cloudflared` release pinned in `packages/core/src/devices/cloudflared.json`
into `<output>/cloudflared-assets/` (or reuses `--cloudflared-assets <dir>`), refuses any asset
whose SHA-256 differs, and places the binary at `bin/cloudflared` in each package; binaries are
never committed. `node scripts/cloudflared-packages.mjs list` prints the packages, assets and
hashes without downloading. These packages are Apache-2.0 and ship cloudflared's `LICENSE`.

Computer and Browser are optional separate Bundles and are not published by this
product workflow. Keep the qualified Provider source pinned; merged upstream
PRs do not qualify an upstream replacement. DSH support remains `0.2.0-rc.1`.

The source packages stay private/0.0.0. The existing product packer creates public
release manifests and precompiled entries in a separate staging directory. It
keeps MIT licenses, Provider attribution and `PROVENANCE.json`. No installed
account, credential, Binding or Service Grant is shipped in a package.

## Releasing a version

`deepseekbot@1.0.1` is the current stable release. A release is triggered by pushing a
SemVer tag on main; nothing publishes from a branch, a PR or a manual dispatch.

1. Archive `Unreleased` in the bilingual Release Ledger under the new version
   ([release rules](agents/changelog.md)) and merge that PR.
2. Tag the merged commit on main and push the tag, for example
   `git tag v1.0.2 <main-sha> && git push origin v1.0.2`. A stable version goes to npm dist-tag
   `latest`; an `-alpha`, `-beta` or `-rc` version goes to `next`.
3. The **npm release** workflow checks that the tag is on main, runs lint, typecheck, tests and
   build, downloads the pinned Provider source, packs the four tarballs and dry-runs them without
   a token. The run summary shows `release-plan.json` and its SHA-256.
4. The publish job waits on the `npm-release` GitHub Environment. A required reviewer approves it
   in the run page (**Review deployments → Approve**); this is the Human publication approval.
5. The publish job verifies the same artifacts and plan digest, then publishes Provider, Core,
   Client and the product in order, waiting up to 40 minutes per package for npm to show the
   exact integrity. After a stable release it moves `next` on Core, Client and the product.

Because the tag fixes the source, merges to main during a release do not affect it. The tag is
the release record; delete and recreate it only if the publish job never started.

## One-time setup

- **Environment:** in repository **Settings → Environments**, create `npm-release`, add the
  release owners as required reviewers, and limit deployments to tags matching `v*`.
- **Trusted Publishing:** on npmjs.com, open each of `@botharness/im-provider`,
  `@botharness/core`, `@botharness/ui`, each `@botharness/cloudflared-*` package and
  `deepseekbot`, go to **Settings → Trusted
  Publisher**, choose GitHub Actions, and enter organization `BotHarness`, repository
  `BotHarness`, workflow `npm-release.yml` and environment `npm-release`. npm then accepts the
  workflow's OIDC identity and attaches provenance; no publish token is stored.
- **`NPM_TOKEN` (optional):** npm's OIDC login covers `npm publish` only. Keep an `NPM_TOKEN`
  secret with dist-tag rights if `next` should move automatically after stable releases;
  without it the job prints the `npm dist-tag add` commands to run by hand. With the token
  present and Trusted Publishing not yet configured, the token publishes as before.

Keep token values in GitHub secret settings; never copy them into source, artifacts, commands,
logs or issue comments.

## Pull request dry runs

PRs that touch release code run **npm prerelease preparation** with a unique
`0.1.0-alpha.1-preview.<PR>.<run>` version. It builds and dry-runs the package set and uploads
the artifacts for review; it cannot publish.

For a local rehearsal after installing the lockfile and building:

```sh
node scripts/npm-prerelease.mjs prepare --version 1.0.2 \
  --provider-source /path/to/qualified-provider --output /path/to/fresh-artifacts
node scripts/npm-prerelease.mjs verify --artifacts /path/to/fresh-artifacts
```

Use a fresh output directory. The Provider needs its lockfile dependencies installed with
scripts disabled; staging rebuilds the managed Host/Client entrypoints.

## When preparation reports a dirty source checkout

Preparation records `sourceDirty`, `sourceChangeCount` and up to 50 Git status/path entries in `release-plan.json`. It also prints the bounded diagnostic under the stable code `release-source-dirty`. The release workflow and publisher use the same check, so a refusal names modified, deleted, renamed and untracked paths instead of only saying the checkout is dirty; additional entries are counted as omitted. Paths are repository-relative and file contents are never included.

Inspect those paths in the original checkout with `git status --short --untracked-files=all` and review the corresponding changes. A generated file may be the cause, but its filename alone is not proof that it is disposable. Preserve unknown changes; the check does not reset, clean, stage or restore files. Correct and review the source through the normal workflow, then prepare a fresh plan. Do not edit a reviewed plan or rebuild an already started immutable release to bypass refusal.

Older plans remain usable when clean. A dirty older plan without captured paths is still refused and directs you to inspect its original checkout; it cannot reconstruct an unrecorded historical file list.

## Interrupted releases

npm publication is not atomic across packages. Preflight checks every existing version and
direct runtime dependency before the first publish. An existing version is skipped, in the dry
run and the publish, only when its exact integrity matches the prepared tarball; different
bytes at that version stop the run. To finish an interrupted release, re-run the failed publish
job of the same workflow run: it reuses the same artifacts, so already published packages are
skipped and the rest are published. Do not re-tag an interrupted release: a new build of the
same version can differ in bytes, and npm never allows overwriting a version. If a version is
unusable, release the next patch version instead.

The product is last so a dependency failure cannot leave a published product requiring missing
internal versions. Before announcing, check every version, integrity and dist-tag on npm.

Code rollback uses the previously qualified product composition and approved Profile backup
procedure; a package revert cannot retract external sends or downgrade a canonical database
generation. Never delete account credentials/history to repair installation. Remove
conflicting standalone Provider/Core/Client Bundle layers before enabling the product and stop
the exact owning Host before switching artifacts.

References: [DSH Bundle publication](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish),
[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/),
[BotUI release reference](https://github.com/BotHarness/BotUI/blob/dee41211aca0da71fe60206b5099283361fdb75a/scripts/release.mjs),
[product qualification](product-im-installation.md).
