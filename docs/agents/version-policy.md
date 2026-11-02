# DeepSeekBot product version policy

[中文](version-policy.zh.md) · [Decision](../adr/0216-dsb-product-versions-identify-immutable-package-sets.md)
· [Implementation map](https://github.com/BotHarness/DeepSeekBot/issues/1979)

**Accepted policy, not completed enforcement.** Follow the issue map for current delivery status.
Documentation, build success, merge and a named milestone do not authorize publication.
This guide supplements the [Release Ledger rules](changelog.md), not a second changelog authority.

**Current workflow gap:** the existing publisher still routes prereleases to `next`, not `beta`.
Do not use it to distribute a tester Beta until #1982's routing and qualification gates ship and
migration is explicitly approved. The [older npm guide](../npm-prerelease.md) describes existing
operator mechanics but contains historical package/version examples; its exclusion of Browser
and Computer is outdated relative to `scripts/product-artifacts.mjs`. Inspect the actual frozen
Release Plan and artifacts, not those examples, before any separately authorized publication.

## Identities and owners

| Identity                          | Rule                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product Release Version           | One exact SemVer for computer-side DSB, `deepseekbot`, `@botharness/core`, `@botharness/ui`, `@botharness/browser`, `@botharness/computer`.                             |
| Tag and ledger                    | `v<version>` and the bilingual release heading agree with the intended product version. A prepared candidate does not pretend that a public tag/release already exists. |
| Running product                   | Host-owned identity of loaded code; the Web and authenticated CLI consume the same result. Never infer it from a moving registry tag.                                   |
| Installed/staged update           | Separate version awaiting activation; a new Host must actually start before it becomes the running version.                                                             |
| Development Build Identity        | Explicitly unreleased source/branch/dirty identity. Show development status, not `0.0.0` as a user-facing software release.                                             |
| DSH / IM Provider / tools / Skill | Independently versioned. Record exact qualified pins and provenance; do not force them into the product version train.                                                  |
| Mobile                            | Independent native app version/build counters and source/artifact identity; unchanged mobile bytes need no rebuild for a computer-only patch.                           |
| Artifact / combination            | Preserve exact package inventory, checksums and source; phone/computer qualification binds exact artifacts, not equal numeric versions.                                 |

Missing/corrupt release metadata or inconsistent product components must return an explicit
unknown/error state and coded refusal where necessary. Do not silently turn a broken release
installation into development mode. An internal `0.0.0` source placeholder may remain; it is
not the release authority. Paths, tokens and private data do not belong in published provenance.

## Version selection and channels

The maintainer selects one version in existing preparation. The frozen Release Plan records
that version, source and complete artifacts; package manifests derive from it. Later commands
verify the expected version/source/plan digest rather than selecting another candidate.

- Patch: compatible fixes; minor: compatible new functionality; major: breaking supported
  user behavior, CLI, configuration or protocol contracts. Judge dependency changes by their
  effect on DSB; not every PR or migration requires a major bump or immediate release.
- Stable: `X.Y.Z` on `latest`. Tester Beta: `X.Y.Z-beta.N` on `beta`, increasing `N` for each
  changed candidate in that target release line. Examples are illustrative, not reserved releases.
- Internal Nightly/CI: unique source/build/artifact identity, no automatic user-facing tag move.
  Existing preview-test identities and historical Alpha/RC entries are not rewritten; no new
  public Alpha/RC channel is introduced.
- `next`: deprecated. Inspect registry and old-client behavior before any separately approved
  migration; retain at most a qualified-stable legacy alias, never new Beta/Nightly. Do not
  delete it based on an assumption that no clients remain. New clients use `latest`/`beta`.
- Channel enrollment and candidate discovery are not compatibility proof or publication approval.
  Preserve independent phone/computer opt-in and existing low-frequency/allowance gates.

## Candidate lifecycle

1. **Prepare:** select version once; coordinate allocation to prevent competing plans for the same
   identity. Use the existing preparation and artifact inventory, not a parallel packager. Dirty
   experiments remain explicitly internal and cannot pass release qualification.
2. **Freeze:** retain the exact package set and Release Plan when handed to QA. Changed code,
   dependency pins or packaging requires another version; SHA or SemVer alone cannot prove bytes.
3. **Qualify:** install the exact artifacts into a fresh disposable DSH Profile with an independently
   installed supported runtime. Check actual loaded paths and UI/CLI identity; the monorepo CLI
   can resolve linked source instead of the intended packages. Follow [packaged qualification](../product-im-installation.md).
4. **Approve:** bind evidence and Human approval to the exact plan/artifacts. Native/source tests,
   installed-product checks and Human QA are separate gates. A source build cannot qualify
   update discovery, upgrade or new-candidate reminders.
5. **Publish:** obtain separate authorization. Verify dependencies and their registry integrities
   before advancing the product entry. Verify the entire set, not only the top-level package.
6. **Read back:** confirm registry/tag identities and actual supported install/update behavior.
   Only then advance the public stable install identity and announcement through their existing
   gates. Bare registry resolution and DSH's inspection/install mismatch remain [#1456](https://github.com/BotHarness/DeepSeekBot/issues/1456),
   not solved merely by passing local tarball installation.

`2.0.0-beta.3 → 2.0.0` is a new artifact identity, even at the same source revision: manifests
and exact internal dependency versions change. Prepare and qualify the final stable set and
approve those bytes; assigning `latest` to the Beta package is not stable promotion. This
does not force a new phone release when the phone artifact is unchanged.

## Failures and retries

One coordinated lane governs allocation/publication. npm package publication is not atomic:
some dependencies may be visible when a later operation fails. Stop, record which exact versions
and integrities are confirmed, and leave uncertainty visible. Do not announce full success,
advance public installation pointers, unpublish packages or silently rebuild to repair the run.
After inspection, resume only the same approved plan/bytes; matching already-published packages
may be reused. Any same-name/version integrity mismatch is a refusal, not an overwrite request.
If the original reviewed artifacts cannot be recovered, allocate a new candidate and requalify.

The UI must distinguish, for example, `Running 2.0.0` from `Installed 2.0.1 — restart required`.
Restart readiness, not an optimistic install response or mutated on-disk manifest, establishes
the new running identity. Never restart busy work automatically or promise universal downgrade.

## Required gates and delivery

- Preparation/publication: version, internal pins, source/cleanliness, full inventory/provenance,
  checksums and expected plan agree; tag/ledger evidence is checked at its real release stage.
- Runtime: source, packaged and invalid/unknown identities are distinct; running/staged versions
  cannot collapse; authenticated Host/CLI and actual Web display agree.
- Publication: stable/Beta/internal/legacy routing, conflicting allocation, dependency-order,
  partial failure, ambiguous timeout and same-byte retry have observable refusal/recovery tests.
- A local-registry dry run is not public npm acceptance. A store upload is not tester installation.
  No workflow activation, live tag change, paid build or production release follows from this guide.

| Slice                                                          | Observable outcome                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [#1980](https://github.com/BotHarness/DeepSeekBot/issues/1980) | About and CLI report actual source/packaged/running/staged identity.                                |
| [#1981](https://github.com/BotHarness/DeepSeekBot/issues/1981) | One frozen candidate prepares and installs with consistent identity; conflicting bytes are refused. |
| [#1982](https://github.com/BotHarness/DeepSeekBot/issues/1982) | Correct channel publication and exact-plan recovery after partial failure.                          |

These are planned tracer bullets, not completed behavior. Existing #1931/#1932 own cross-device
acceptance; #1933 consumes this path for later quota-gated automation. Do not duplicate their
owners, the upstream DSH installer, telemetry or the shared device queue.
