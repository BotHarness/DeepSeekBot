---
Status: Accepted
Date: 2026-09-29
---

# DSH compatibility is a SemVer range whose floor is the verified host line

Every workspace package declares `engines.dsh` as `>=0.2.0-rc.1 <0.3.0-0`. The floor is the exact DSH version BotHarness verified — currently `0.2.0-rc.1`, the worktree devDependency and the version the local dev loop checks — and the ceiling keeps the declaration inside the 0.2 line so a future 0.3 breaking change must be adopted deliberately. DSH treats the field as declarative metadata today (`@deepseek-ai/dsh-package-manifest` types: "Compatible DSH versions as a SemVer range, including an exact version"; "DSH compatibility is declarative until a reader enforces it"), so the range is a claim for readers and for future enforcement, not a runtime gate. `devDependencies` stay exact because they are the build, type, and test baseline; `peerDependencies` stay exact because the profile supplies the instance, profile resolution does not validate ranges, and loosening them would change install-graph behavior without new verification.

## Why

- An exact host line reads as a hard pin and forced a release-shaped BotHarness change on every DSH RC even when nothing else moved; a range keeps the honest floor while covering later 0.2.x lines the same verification train adopts.
- 0.1.x cannot be the floor: 0.1.5 crashed Bot mode (dsh-dev pitfall #19b) and 0.1.7 → 0.2.0 carried Client UI behavior changes. A lower floor would claim combinations nobody verified.
- Prerelease semver needs an explicit comparator: `>=0.1.5` does not match `0.1.7-rc.2` at all, and a future `0.2.1-rc.1` needs its own floor bump because prerelease tuples only match a comparator with the same tuple.

## Considered options

- **Keep the exact host line (ADR-0022's reading)** — rejected: churn on every RC and misleading semantics for readers.
- **Floor only (`>=0.2.0-rc.1`)** — rejected: silently claims future majors.
- **Lower floor (`>=0.1.7-rc.2` or `>=0.1.5`)** — rejected: unverified cross-version claims; the 0.1.5 line is known-broken.
- **Loosen `peerDependencies` too** — deferred: peers describe the profile-supplied instance, profile resolution does not validate them, and changing them alters install-graph behavior without new verification.

## Consequences

- A DSH RC bump still updates the floor when the version tuple changes (for example `0.2.1-rc.1`), but stable 0.2.x releases no longer need a manifest change.
- A manifest contract test keeps the four packages aligned and anchors the floor to the pinned devDependency.
- If a reader starts enforcing `engines.dsh`, a profile on a verified 0.2.x line installs without a BotHarness release, while 0.3 stays blocked until adopted.
- Decision record: #423.

## 2026-10-18 correction for the 1.4.0 candidate

The current DSH installer and Profile loader enforce `engines.dsh`; when present it takes precedence over DSH peers. The native evaluator includes prereleases. The earlier statements above that enforcement is absent and that every new prerelease tuple requires a floor bump are historical and no longer describe current DSH. See the [official Bundle documentation](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish) and [native preflight rules](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/README.zh.md).

Following the actual 0.2.1 API migration in #2159, the new admission policy is `>=0.2.0-rc.2 <0.3.0-0`. The lower bound stays at the previously supported 0.2.0-rc.2; a newer build SDK alone is not a reason to raise it. All first-party DSH engines and Host-provided peers follow this policy. npm peers additionally name the qualified 0.2.1 prerelease tuple (`|| >=0.2.1-0 <0.3.0-0`), because npm default SemVer matching does not include every prerelease admitted by native DSH. Build/type/dev dependencies and version-specific native patches remain exact. This replaces the temporary exact-0.2.0/0.2.1 admission policy while adapting both native API generations explicitly. Native preflight tests cover subsequent RC and stable version strings separately from the finite list of released versions qualified through real artifact installation. The independently released IM Provider retains its existing policy and still participates in the product installation gate.

A broad 0.2.x admission range avoids unnecessary rejection at installation; it is not a promise about all future APIs. An unbounded range would silently admit another pre-1.0 minor API line, so 0.3 remains a deliberate review boundary. The [1.4.0 qualification plan](../agents/dsh-1.4-release-qualification.md) records the release gates and the distinction between compatibility admission and runtime evidence ([#2167](https://github.com/BotHarness/DeepSeekBot/issues/2167)).

The 1.4.0 dual-version correction also packages the unchanged native ComputerUseRegistry as a child Plugin owned by the product Computer Plugin, with its exact source pin and exclusive-registration lifecycle tests. A separately installed 0.2.1 native manifest would reject the 0.2.0 Host solely through its dsh-brand peer. This does not add an exemption or modify the upstream manifest; the product owns qualification of its bundled component. The fresh-install gate rejects any native Plugin disablement.
