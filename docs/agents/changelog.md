# Release Ledger

`CHANGELOG.md` is the English canonical Release Ledger for DeepSeekBot.
`CHANGELOG.zh.md` is its maintained Chinese counterpart. Together they answer one question:
what observable difference will a user or DSH plugin developer find in a DeepSeekBot release?

The independently installable DSH Skill follows the same ledger shape under
`.agents/skills/dsh-plugin-dev/`; its additional provenance rules are below.

Use `pnpm changelog:check` before review. The check validates objective structure and bilingual
parity; Human review owns notability, accuracy, and prose quality.

## Artifact boundaries

The accepted [product version policy](version-policy.md) binds computer-side DSB software, its npm
product/component packages, Git tag and ledger identity to one frozen Release Plan. DSH, the
independent Provider, tools/Skill and mobile retain their own versions. Enforcement is tracked in
[#1979](https://github.com/BotHarness/DeepSeekBot/issues/1979); this documentation does not claim
that all identity, channel and recovery gates have shipped or authorize a live tag change.

Public install instructions use the published stable identity in `scripts/install-release.json`, not the development package version or npm's moving `latest` tag. After publishing and verifying registry bytes and qualification evidence, update that identity, run `pnpm install:sync` and `pnpm install:check`, and review the resulting README/guide changes. The check runs in lint and rejects drift. Never advance this file during prerelease preparation or before publication.

Before publication, the `prepare` job of `npm-release.yml` runs `scripts/e2e-fresh-profile-install.mjs` on the exact prepared tarballs: for every supported DSH release it installs the product into a brand-new Profile with no pre-approved builds, then boots the Host, creates a Bot and DM, and restarts. A dependency that needs build approval fails the release, because users would otherwise have to approve it on the Plugins page before DeepSeekBot installs.

In the product Site checkout, run `BOTHARNESS=<this-qualified-checkout> pnpm install:sync` to copy the identity and synchronize only the bilingual installation guides. Site copy buttons and CLI instructions derive from this identity. Ship the two PRs through their normal review gates; this is a repeatable release-sync command, not an automatic publication or npm candidate-selection bypass. Registry candidate selection/upgrade E2E and the DSH-owned preview/install mismatch remain separate gates.

| Artifact                                  | Owns                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Release Ledger                            | The observable differences delivered by each DeepSeekBot release.                                                           |
| GitHub Release                            | The release announcement derived from the ledger, plus Highlights and contributors when useful, and a full comparison link. |
| ADR                                       | Why a durable architecture choice was made and which alternatives were rejected.                                            |
| Context, architecture, and specifications | The current product language, relationships, and normative design.                                                          |
| Issue and PR                              | The implementation plan, discussion, verification, and contributor provenance.                                              |

Link to those artifacts instead of copying their detail into the Release Ledger.

## When to add an entry

Add a change to `Unreleased` when it affects a user or DSH plugin developer through one of these
branches:

- a feature, compatible behavior change, or bug fix;
- a breaking, deprecated, removed, or security-relevant behavior;
- reliability, security, performance, compatibility, or plugin developer experience;
- independently valuable public documentation, including a published architecture decision or
  contributor mental model.

Ordinary refactors, tests, dependency refreshes, CI changes, formatting, and implementation steps
stay in their Issue or PR. Record them only when their result crosses one of the branches above.
When one feature includes matching documentation, write one entry in the feature's section and
link the documentation. Use `Documentation` for a change whose delivered result is the public
documentation itself.

## Ledger shape

Keep `Unreleased` first. Archive it under a SemVer identity and ISO date only when that version is
released:

```markdown
## [Unreleased]

One sentence summarizing the next release for its readers.

### Added

- Added an observable capability and its value ([#123](https://github.com/BotHarness/BotHarness/issues/123)).

## [0.2.0] - 2026-10-01

One sentence summarizing the released version.
```

Use these sections when they contain entries:

- common: `Added`, `Changed`, `Fixed`, `Documentation`;
- conditional: `Breaking Changes`, `Deprecated`, `Removed`, `Security`.

Omit empty sections. Every change entry links at least one GitHub Issue or PR. Link user action to
the relevant guide and architecture rationale to its ADR. A change is normally one sentence and
may use a second sentence only for a migration, limitation, or required action. There is no fixed
word-count gate.

The ledger contains one migration-only `Development` section. It consolidates the implemented
work that predates the first release and is published as development history without a version.
Do not add another `Development` section, use it as a project-status state, or interpret it as a
tagged prerelease or installable artifact. All future public release entries use dated SemVer
sections; active and merged work stays in `Unreleased` and the Development status surface.

An alpha, beta, or RC section enters the Development status `Pre-release` state only when the
canonical bilingual ledgers carry both pieces of release evidence before its change sections:

```markdown
- **Release tag:** [`v1.0.0-rc.1`](https://github.com/OWNER/REPO/releases/tag/v1.0.0-rc.1)
- **Installable artifact:** [Download bundle](https://github.com/OWNER/REPO/releases/download/v1.0.0-rc.1/plugin.bundle)
```

Evidence is artifact-bound: DeepSeekBot uses `BotHarness/BotHarness`, while DSH Skill uses
`BotHarness/dsh-skill`. The tag URL must be the exact HTTPS GitHub Release tag in that repository
for `v<version>`. The install URL must use the same repository and tag with the shape
`/releases/download/v<version>/<nonempty-asset>`; arbitrary pages, another repository or tag, and
URLs with a query or fragment are rejected. Keep both URLs identical in the English and Chinese
ledgers. A prerelease heading without this explicit authority fails validation and never appears as
`Pre-release`.

Describe the result before implementation detail:

```markdown
- Fixed duplicate Inbox Admission after provider retries, so a PersonaBot wakes once per Source Event ([#123](https://github.com/BotHarness/BotHarness/issues/123)).
```

Do not turn the ledger into a commit log:

```markdown
- Refactored three stores, added six tests, renamed two methods, updated schemas, and revised ADR-0041.
```

For a published design that has not changed runtime behavior, use documentation language:

```markdown
- Documented the provider-bound Trigger design; runtime behavior is unchanged ([ADR-0040](docs/adr/0040-personabot-export-wraps-soul-and-optional-operational-facets.md), [#123](https://github.com/BotHarness/BotHarness/issues/123)).
```

Use `Breaking Changes` to state the affected reader, old behavior, new behavior, and required
migration. Put lengthy steps in a migration guide. In the `0.x` line, compatible features and
breaking changes advance the minor version; compatible fixes and important documentation-only
releases advance the patch version. The first public version remains a release-scope decision.

## Bilingual parity

Update both ledgers in the same PR. Natural translation is expected; duplicated sentence structure
is not. Keep these facts identical and in the same order:

- release identity and date;
- section names and section order;
- every link target.

The validator deliberately does not compare translated prose. Keep section names in English in both
files so categories remain mechanically identical.

## DSH Skill release train

The DSH Skill uses `.agents/skills/dsh-plugin-dev/CHANGELOG.md` as its English canonical ledger and
`CHANGELOG.zh.md` as the maintained Chinese release history. Update them for the same change
branches described above and run `pnpm skill:changelog:check`.

Skill SemVer is independent from DeepSeekBot SemVer. Every dated Skill release records these facts
before its change sections:

- `Skill version` — identical to the release heading;
- `Verified against DSH` — the DSH version whose behavior was checked;
- `Upstream revision` — the full SHA linked to the corresponding DSH commit.

The current dated release must match `SKILL.md` metadata. `SKILL.md` remains the sole Agent
instruction authority; Chinese belongs in the human-facing references and release history.

## Contribution and release flow

1. Add one result-focused bilingual entry as a change fragment under [`changes/`](../../changes/README.md)
   and run `pnpm changelog:check`. Do not edit the `Unreleased` sections of `CHANGELOG.md` and
   `CHANGELOG.zh.md` in a feature PR: every parallel branch would then edit the same lines and
   conflict. The check, the Development status page and candidate builds read the ledgers with
   the fragments composed into `Unreleased`.
2. During the release PR, run `pnpm changelog:fold` to append the fragments to `Unreleased` in
   both ledgers and delete them. Then merge entries that describe one observable result, even when several PRs
   produced it. Preserve the necessary Issue and PR links.
3. Give the ledger release one summary sentence.
4. Derive the GitHub Release draft from that version, then add up to three optional Highlights and
   contributors when they genuinely help, followed by the full comparison link.
   Every DeepSeekBot Release, including prereleases, starts with version-specific short links:
   `https://deepseekbot.app/r/v<version>` for the official website, `/install` for the Chinese
   installation guide, and `/install/en` for English. The Site Worker expands them with
   `utm_source=github`, `utm_medium=release`, `utm_campaign=deepseekbot_v<version>` and
   `utm_content=website|install_zh|install_en`. Keep these entry points before technical notes;
   `release:draft` inserts them automatically. Deploy and verify the Site redirect contract
   before publishing short links; use direct destination URLs with the same UTMs until then.
   These are announcement navigation, not additional change entries. Existing `ref` links and
   analytics consent remain unchanged; routing tests are not traffic or conversion evidence.
   The independent DSH Skill release is unchanged.
5. Obtain explicit Human publishing approval before creating a tag, publishing an artifact, or
   creating the GitHub Release.

Before release, remove an `Unreleased` entry whose change was fully reverted. After release, keep
history immutable and describe a restoration, withdrawal, or fix in the next version.

## Preparing a GitHub Release draft

After archiving `Unreleased` under a dated version, generate a review-only payload from that exact
canonical release section:

```bash
pnpm release:draft -- \
  --artifact deepseekbot \
  --version 0.2.0 \
  --tag v0.2.0 \
  --github-release-version 0.2.0 \
  --installable-version 0.2.0 \
  --comparison-url https://github.com/BotHarness/BotHarness/compare/v0.1.0...v0.2.0
```

Use `--artifact dsh-skill` for the independent Skill release train. The command reads that
artifact's English and Chinese ledgers, verifies their release structure, and writes a
deterministic JSON payload to stdout. Its explicit release-plan evidence requires the canonical
version, `v<version>` tag (including an alpha, beta, or RC suffix when present), intended GitHub
Release version, and installable artifact version to agree. This is an offline consistency gate: it
does not claim that a remote tag, registry artifact, or GitHub Release exists. Skill drafts also
require current `SKILL.md` metadata to match the target Skill release and carry its verified DSH
version and linked upstream revision.

The optional repeatable flags are `--highlight` (at most three), `--contributor`, and
`--new-contributor`. The full comparison must be an HTTPS GitHub comparison for the selected
artifact, end at the target tag, and start at the directly preceding dated release when one exists.
A DeepSeekBot release whose only category is `Documentation` is labelled `runtime behavior is
unchanged`; it is called a patch only after a release in the same major/minor line, while a first
public version remains a Human release-scope decision. A prerelease payload is emitted only for an
alpha, beta, or RC version with the matching identities and explicit `--tagged --installable`
positive evidence.

This command is deliberately dry-run only. It does not create or push a tag, publish a package or
Bundle, or create a draft/published GitHub Release. Each external action still requires an explicit
Human release instruction.
