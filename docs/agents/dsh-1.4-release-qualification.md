# DeepSeekBot 1.4.0: DSH compatibility qualification

Target release: **1.4.0**. This is a preparation plan, not a published release or a claim that unreleased DSH versions work. Tracking: [#2167](https://github.com/BotHarness/DeepSeekBot/issues/2167).

## Admission and qualification are separate

The product declares `>=0.2.0-rc.2 <0.3.0-0` in `engines.dsh`; Host-provided DSH peers follow the same admission policy, with an additional explicit 0.2.1 prerelease comparator for npm’s default SemVer matching. The development dependencies, lockfile and `productDsh` remain exactly `0.2.1-rc.2`. `productDshVersions` names concrete releases for artifact qualification; it must never be populated with invented future versions or inferred from a broad range.

DSH's native preflight evaluates ranges with prereleases included. Contract tests therefore exercise representative future 0.2.x RC and stable version strings, without claiming to run those nonexistent releases. Ordinary npm SemVer peer matching may exclude future prerelease tuples; native DSH admission remains the compatibility authority, and real installation through its supported plugin manager is a separate gate. Never recommend `--force`, edits to user compatibility exemptions, or disabling checks as the fix.

The 0.2.1 API migration in [#2159](https://github.com/BotHarness/DeepSeekBot/pull/2159) is a prerequisite. Its Subagent activation, authenticated peer and settings changes mean this range must not be applied to the published 1.3.1 implementation. The compatibility adapter retains 0.2.0-rc.2 support: select native Subagent capabilities before starting work, preserve cancellation/delivery ownership, and accept only the native authenticated Owner identity for that API generation. A failed modern operation must never be retried through a legacy API. A future 0.3 API line requires a deliberate compatibility review rather than an unbounded `*` declaration.

## Runtime composition

The build baseline stays at 0.2.1-rc.2 while the install floor remains 0.2.0-rc.2. The product preset uses the common native Plugin set; 0.2.1-only time-context and tool-schedule are omitted from that preset, without the legacy `{{cwd}}` suffix that 0.2.1 no longer registers. Application-defined Bot schedules remain available. Native Shell and Subagent implementations resolve from the running Host. The scoped filesystem tool remains bundled to retain the reviewed read_image injection fix. When the Host lacks workingDirectory, its local adapter reads the existing Session cwd, checks cancellation and refuses a missing cwd; it creates no global service or new workspace authority.

The native ComputerUseRegistry JavaScript is identical in the two qualified releases. The product bundles that pinned registration as a child Plugin owned by `@botharness/computer`, under the product’s tested compatibility range, instead of installing a second native package whose exact dsh-brand peer disables it on an older Host. Its native exclusive registration and disposal semantics remain intact. No compatibility exemptions are created. Fresh-install qualification refuses native preflight disablement, including otherwise bootable Profiles.

## Before publishing 1.4.0

- Integrate and review #2159 and this range change. Independently closed Tob/Home PRs are not implicitly approved or included.
- Prepare one immutable 1.4.0 candidate using the existing release tooling, with source SHA and tarball digests. Verify every first-party package's range in those exact tarballs.
- Run the existing fresh-Profile artifact installation gate on both DSH 0.2.0-rc.2 and 0.2.1-rc.2, including the bundled IM Provider: install without pre-approved builds, boot, create a Bot and DM, restart and read back. An engine preflight alone is insufficient.
- On macOS Desktop, verify actual package installation, Bot mode, a real DM reply, delegation/Assignment completion and restart. Qualify Browser/Computer and Provider seams affected by the native upgrade; retain platform-specific gaps as explicit gates. UI checks for this task are Desktop-only.
- Run the applicable CI and release checks. Qualification evidence belongs to the exact candidate, not merely the branch's linked development installation.
- Publish only the approved candidate. Do not advance `scripts/install-release.json`, installation guides or a release tag before successful registry publication and readback. Source package `0.0.0` remains a development identity; the release command stamps 1.4.0.

## Future 0.2.x updates

When DSH publishes another 0.2.x version, run installation/startup and critical-seam checks against the existing candidate first. Compatible updates should not require a DSB metadata-only release. Record failures by missing capability or changed contract; fix adapters before broadening actual runtime support. Keep the qualification list concrete and the admission range broad. Unknown future behavior is not verified behavior.

## Current review evidence

The 2026-10-18 [compatibility record](../../.github/pr-assets/2168-compatibility/README.md) binds the exact local 1.4.0 artifacts and native Desktop checks to their source revisions. Both final fresh installations passed. After provider credit was restored, the final older-Desktop DM, Assignment file write/read, foreground fork/spawn, background parent delivery and post-restart retained results also passed. Actual Browser/Computer operations and external IM delivery remain separate publication gates; this candidate is not release-qualified.

## Native admission and npm peer matching

The native DSH engine range remains `>=0.2.0-rc.2 <0.3.0-0`; DSH evaluates it with prereleases included. npm peer matching uses different defaults, so product peers additionally declare `|| >=0.2.1-0 <0.3.0-0` for the qualified 0.2.1 prerelease tuple. The separately versioned Provider preserves its broader policy and also names that tuple. The Client Cordis peer is `^4.0.4`, covering both qualified Hosts; development remains pinned to 4.0.5. Tests exercise npm default SemVer separately from native admission. A future unknown prerelease tuple is admitted by native metadata but must have its package-manager peer resolution qualified before release; do not claim a generic npm range proves that gate.
