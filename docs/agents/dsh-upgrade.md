# Follow a DeepSeek Harness RC

Use this runbook when DSH publishes an RC, when changing the development SDK/CLI,
or when qualifying an existing Tobs release on a newer Host. Routine tracking
follows RC releases; Alpha releases require an explicitly scoped investigation.
An upstream stable release may reuse RC evidence only when its relevant artifact
bytes and runtime contracts are shown unchanged; otherwise qualify the changed paths.

Policy confirmed in [#3477](https://github.com/BotHarness/DeepSeekBot/issues/3477).
Read `dsh-plugin-dev` Context and Decision Tree, then `dsh-dev` and
`verify-deepseekbot`. Use the [agent work trace](agent-work-trace.md) for ownership.

## Keep four facts separate

| Fact                    | Authority                                                                                                                                    | Meaning                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Admission floor         | `scripts/dsh-compatibility.mjs`, package `engines.dsh`, [ADR-0087](../adr/0087-dsh-compatibility-is-a-semver-range-with-a-verified-floor.md) | `>=0.2.0-0`, including prereleases, without a speculative upper bound.                                       |
| Development baseline    | Exact package dependencies, lockfile and `productDsh` in `scripts/product-artifacts.mjs`                                                     | Reproducible SDK/CLI input, independent of the admission floor.                                              |
| Qualification matrix    | `productDshVersions` and the version-specific evidence record                                                                                | Concrete released runtimes tested against a named product artifact. Listed targets are not proof of passing. |
| Published Tobs identity | `scripts/install-release.json`                                                                                                               | Published stable product, independent of the DSH baseline.                                                   |

A newer SDK never raises the floor by itself. Preserve older Host capabilities
through explicit adapters. Native capability, authorization and integrity refusals
remain failures to investigate. An admitted future version is not a tested version.
The current oldest concrete qualification target is `0.2.0-rc.2`; the broader
admission floor does not establish runtime evidence for earlier prereleases.

## 1. Establish the upstream and product baseline

Read the official release notes, source comparison and published package manifests.
Record the exact tag/source revision, package versions and artifact digests. Check
that the RC's dependency wave is installable before changing the working baseline.
Review open upgrade claims and related upstream issues.

First install the current **published Tobs artifact** on the new RC in an isolated
Profile. Preserve the installed package inventory, startup logs, API health and
Client diagnostics. Exercise the reported or changed paths. A successful linked
source build is a different result from a user's published installation.

Done: the record distinguishes existing-product behavior, upstream changes and
any reproduced incompatibility. Missing upstream packages are an upstream blocker,
not permission to silently substitute another release.

## 2. Adapt only the affected contracts

Review Host Services, Client Slots, Agent/Session lifecycle, tools and permissions,
package loading and settings against the actual RC source. Update exact SDK/CLI
dependencies and their lockfile together. For every native patch, record whether
it remains necessary, needs adaptation, or is superseded by an upstream fix; retain
a behavior check for its original purpose.

Keep immutable Provider source revisions and original build provenance intact.
Change the independently versioned Provider only when its generated artifact changes.
Preserve separately pinned/copied native inputs until their own transformation and
runtime checks pass. Follow [CLI parity](../../AGENTS.md#cli-parity-ax) for changed
Host routes, bridge methods or Bot tools.

Done: the source builds, focused regressions and required checks pass, and old/new
API selection has no error-swallowing fallback. Preserve failing attempts.

## 3. Qualify one artifact across runtimes

Retain the oldest concrete supported target, the previous development baseline and
the new RC in the artifact matrix. Preserve additional historical targets unless
their removal is separately justified. Prepare one product candidate through the
existing artifact tooling and use the same bytes for all comparisons.

| Check                    | Required evidence                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installation and restart | Fresh Profile, no pre-approved builds, no compatibility-disabled Plugins; Bot/DM and retained Memory/history survive restart. Run `scripts/e2e-fresh-profile-install.mjs` on the frozen artifacts.            |
| Core behavior            | Actual model reply; Assignment and native Subagent completion/delivery; file read/write; applicable owner/refusal checks on minimum, previous and new runtimes.                                               |
| Upgrade                  | Existing published product/data to candidate, including running versus staged version, actual activation/restart, retained Bot/Channel identities and drafts. A fresh install alone does not cover migration. |
| Browser / Computer / IM  | Real affected Provider operations; separately name permission, download, takeover and external-delivery coverage. API success alone does not establish visible behavior.                                      |
| Windows Desktop          | Native install, startup, Bot mode, settings, layout, update/restart and affected user interactions; record exact runtime and OS.                                                                              |
| macOS Desktop            | The same native checks, independently recorded; Windows or Web results do not qualify macOS.                                                                                                                  |

Source CI, packed-artifact installation, real-model checks, Web and native Desktop
are separate evidence columns. Ordinary PR CI does not automatically run every row.
Unrun platforms remain **unverified**, and a failed required row prevents an overall
compatibility claim. A documented partial result may be reviewed without calling it
complete. Follow shared QA ownership rules for any mobile/device checks.

A full source suite on Windows is supporting evidence, not a substitute for the rows
above. Keep the repository's 15-second guard and run it with the diagnostic
`--testTimeout=60000` flag; report that allowance explicitly. Triage by cause before
changing a test: an open SQLite owner before temp-root deletion (EPERM), POSIX-only
assertions, stubbed time zones that survive `unstubAllEnvs()` on Windows, and paths
that rely on `ENOTDIR` are platform behavior. Fix the platform assumption or the owning
product path rather than deleting coverage; keep a per-test Windows allowance only for
an inherent stress cost such as forty SQLite-backed Group hops.

Done: each required row is passed, failed or unverified with a reason and an evidence
pointer. Stop only owned processes and retain failure evidence and recovery limits.

## 4. Update records and choose the release path

Maintain a version-specific record such as `docs/agents/dsh-022-rc1-upgrade.md` with:

- upstream tag/SHA and comparison; Tobs source and exact artifact identity/digests;
- unchanged admission floor, old/new development pins and tested matrix;
- patch/adapter decisions and linked regression tests;
- per-runtime and per-platform results, failures, untested gates and recovery limits;
- issue/PR links and the next action for any incomplete qualification.

Keep earlier records historical; update this runbook only when the recurring process
changes. Update relevant feature maps and development guides when entry points move.

**No product change:** update compatibility evidence and documentation. Do not issue
a metadata-only Tobs release merely because DSH published an RC. Updating a development
pin does not itself require a user-facing release.

**Product adaptation or user-visible change:** add the bilingual change fragment and
follow [Release Ledger](changelog.md), [product version policy](version-policy.md)
and [packaged qualification](../product-im-installation.md). Freeze, review, qualify,
publish and read back through the existing workflow. Publication remains a separate
authorized action; a merge or compatible RC does not advance the public install identity.

## 5. Reuse the existing documentation and Site release steps

After an authorized Tobs publication and registry readback, advance
`scripts/install-release.json`, run `pnpm install:sync` and `pnpm install:check` in
the product checkout. Update bilingual release notes through their existing ledger
workflow. When only compatibility documentation changed, keep that identity unchanged.

For the separate product Site, use the qualified product checkout as `BOTHARNESS`:
run `pnpm install:sync` for changed installation guidance, `pnpm changelog:sync` for
new release notes, and the Site's `docs:sync --only ...` for the affected guides.
Inspect that repository's instructions and command help before running them; then
run `pnpm verify`, submit its PR and deploy only within the authorized release scope.
Synchronization alone is not deployment.

The product repository's `apps/docs` is a separate generated surface: use
`scripts/sync-docs.mjs` and the normal docs build. Edit the source documents, not
generated pages. Record which documentation/Site changes shipped and which remain
pending; a code PR does not imply the website was published.
