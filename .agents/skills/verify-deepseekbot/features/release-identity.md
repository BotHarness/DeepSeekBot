# About and running product identity

Candidate journey for #1980; packaged/restart qualification is still pending.

## Sub-features

- Source-build identity in About and the authenticated release-info readers.
- Loaded component composition, installed identity and staged restart qualification; these remain pending.

## How to get to it (user POV)

Enter Bot mode, choose Bot settings, then About.

## Driving it with verify-app

1. Launch an isolated Host with `verify-app launch --name <name>` and run `doctor`.
2. Enter Bot mode, dismiss the tutorial, choose Bot settings, then About.
3. On a source checkout, verify that DeepSeekBot version says development source build with the built Git revision and dirty state, not a `0.0.0` release. The update check is disabled.
4. Read `botharness/releaseInfo` through `verify-app rpc` and `deepseekbot release-info` through the authenticated CLI. Their identity must agree with About. Keep the token in an environment variable or private file, never in output.
5. On an independently installed exact product artifact set, repeat the path and record artifact checksums and actual loaded component paths. A matching directory of package manifests is not proof of the loaded process.
6. Stage a controlled update on that disposable Host: the old running version and new installed version must remain separate. Only a new Host answering with the exact staged identity allows the Client to reload.

## Refusals and compatibility

- Missing/corrupt metadata produces unknown identity, not source development. Installation and restart refuse with `release-identity-invalid`.
- A legacy Host without identity is labelled unverified; do not invent provenance.
- Verify EN/ZH and light/dark before/after pairs. Unit DOM rendering does not replace these captures.

## Gotchas

- The source CLI deliberately keeps the internal `0.0.0` placeholder; the separate identity carries source provenance.
- Each first-party Plugin stamps its callback with module-load package metadata. Release qualification compares active Registry callbacks with the captured product composition; disk manifests alone cannot qualify a release. Missing active components stay unverified during boot.
- During the initial #1980 run, the collaborative browser could drive About and read its DOM, but `preview_snapshot` failed repeatedly. No screenshot or full locale/theme qualification was obtained.
- Never use the shared QA Host or a production Host for staged update/restart verification.


## Proactive update notice (#2173)

Use an isolated macOS Desktop Profile for native acceptance when requested; do not substitute browser automation. Enter Bot mode with a qualified packed candidate below the registry target. Wait for onboarding and installed notes to finish: the upgrade modal must show running DSB, actual native DSH and exact eligible target. Dismiss, re-enter and restart: the same target stays dismissed while About still exposes it. Change only the registry transport fixture to a newer target to verify a fresh notice. Record fixture provenance; an unpublished 1.4.0 is never evidence of a live published release.

Use `release-check --force` for cache recovery and canonical compatibility readback. Unknown runtime/metadata cannot offer an install. An incompatible latest may select a lower compatible version, without following a preview tag for a stable install. An explicit install revalidates metadata and uses the native Plugin Manager; preserve native failures and staged/running identity. Published 1.3.1 Clients do not retroactively gain the proactive entry point when 1.4.0 is published.
