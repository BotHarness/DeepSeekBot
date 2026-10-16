---
Status: Accepted
Date: 2026-10-16
Issues: [#1979](https://github.com/BotHarness/DeepSeekBot/issues/1979)
---

# DSB product versions identify immutable package sets

DeepSeekBot on the computer is an npm-delivered DSH Bundle, not a separately versioned
desktop executable. One **Product Release Version** identifies `deepseekbot` and its
co-released Core, UI, Browser and Computer packages, with matching runtime UI/CLI, Git tag
and Release Ledger identities. Independent DSH, Provider, tool/Skill and mobile versions
remain separate. This preserves [ADR-0127](0127-product-artifacts-compose-an-independently-versioned-im-provider.md)
and the accepted independent phone/computer qualification policy in [#1930](https://github.com/BotHarness/DeepSeekBot/issues/1930).

The Human confirmed this policy; enforcement is tracked in #1980–#1982, not asserted by
this ADR. The [version-policy guide](../agents/version-policy.md) defines the operator rules.

## One identity authority

The existing release preparation accepts the product SemVer once. Its frozen Release Plan
binds that identity to source, dependency provenance and the complete artifact inventory.
Manifest versions are generated; tag/ledger/runtime identity is checked against the plan.
There is no second manually maintained software version, version service or release database.
SemVer communicates product compatibility rather than mirroring a dependency's numbering.

An explicit development build has a Development Build Identity, not a fake release number.
An installed release with missing/corrupt identity is unknown or invalid, not implicitly a
development build. The current runtime identity and a staged update are different facts;
reading changed package files or moving npm tags cannot change the identity of loaded code.

## Freeze artifacts before qualification

Once a candidate reaches QA or distribution, its package-name/version-to-bytes mapping is
immutable. A retry uses the same artifacts and plan; changed source, dependencies or packaging
requires another version and evidence. Source SHA alone is insufficient to identify bytes.
Beta-to-stable changes package versions and internal dependencies even when source is unchanged;
the stable artifact set therefore requires its own qualification and approval.

Stable releases use `latest`, tester Betas use `beta`, and internal Nightly/CI candidates
cannot automatically reach either. Public Alpha/RC channels are not added by this policy.
The deprecated `next` may become a stable-only legacy alias after explicit migration approval;
it is not deleted or moved by accepting this design. No known users is not proof of zero clients.

Publication is dependency-first and integrity-verified before advancing the product entry.
One coordinated release lane prevents conflicting version allocation/promotion. npm cannot
provide a transaction over the package set: partial visibility is reported honestly, uncertain
readback stops promotion, and recovery resumes the same reviewed bytes instead of unpublishing
or overwriting. User-facing announcement/install pointers follow their separate release gates.

## Trade-offs

- Independent versions for every internal component were rejected: these packages ship as one
  user-facing product and should not require users to interpret a component version matrix.
- Forcing DSH/Provider/mobile to the product number was rejected: they have independent ownership,
  compatibility and platform rollout. A matching number is not proof of a qualified combination.
- Deriving the running version from `latest`, or relabeling a prerelease as stable, was rejected:
  neither describes the code executing on the user's computer.
- Rebuilding under an approved version was rejected even for convenience: it breaks the
  relationship between QA evidence, approval and installed bytes.

This policy changes no runtime, registry, store or schedule by itself. Existing low-frequency,
quota-limited Beta, independent opt-in, non-OTA and Human approval boundaries remain intact.
