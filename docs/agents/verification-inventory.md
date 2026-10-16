# Verification coverage report

Run from the checkout you intend to qualify:

```bash
node scripts/verification-report.mjs
node scripts/verification-report.mjs --json
node scripts/verification-report.mjs --activity-run .humanlayer/verify/<name>/activity-idle/<attempt>
```

The report reads the current feature map, all `scripts/e2e-*.mjs` files and
`scripts/verification-inventory.json`. It does not start a Host, send a message, run a
historical script or operate a device. Each behavior row links its current implementation,
maintained instructions or an explicit gap, and candidate scripts. The complete script
section retains helpers and wrappers in the denominator. A script can relate to several
behaviors and a behavior to several scripts; each file and behavior is counted once.

## Read the numbers

- **Feature documents** count files, not behavior or code coverage.
- **Script mapping** counts unique E2E files explicitly referenced by the feature map over
  all E2E files. Historical regression, superseded, needs-repair and undetermined entries
  remain in the total; a helper does not become a user journey merely because of its name.
- **Functional-path coverage** and **verified-behavior rate** remain **unknown** while the
  product behavior denominator is incomplete. Catalogue rows group related acceptance
  paths and are not an exhaustive count of product features. Scripted/manual/gap counts
  describe this catalogue only; a mapped script may cover just part of a grouped row.
- **Qualified catalogue rows** count only current evidence accepted by the behavior-specific
  Activity Center or Workspace Grant validator. Manual instructions and past CI results
  never become passes.

This audit includes every current map document and E2E file, and additional implemented
Client, CLI and mobile entry points found in those scripts and their owning modules.
Unmerged mobile Activity redesign (#1954) and unqualified release/restart promises are
not counted as implemented paths. Remaining discovery belongs to the AX spec/hub
[#1967](https://github.com/BotHarness/DeepSeekBot/issues/1967) /
[#1971](https://github.com/BotHarness/DeepSeekBot/issues/1971). The inventory is an explicit
boundary, not a claim to have discovered every possible user behavior.

## Evidence is selected, never guessed

Follow the [idle PersonaBot path](../../.agents/skills/verify-deepseekbot/features/activity-center-idle.md)
to launch, drive, capture, visually inspect and stop a task-owned Host. Pass one immutable
attempt directory to this report. It delegates to `activity-idle-report.mjs`, including
its screenshot/ARIA review receipt and hashes; no second runtime state store is introduced.

The row distinguishes `not-run`, `pass`, `fail`, `blocked` and `needs-revalidation`.
A different source SHA, dirty checkout, missing/changed evidence or missing visual review
expires a previous pass. A selected record for another behavior fails reference integrity.
The first failure and partial files remain in their original attempt; select a later attempt
explicitly, without rewriting earlier results. No evidence for other behaviors means
`not-run`. Native history is always shown separately as requiring revalidation.

The command's exit code checks **report/reference integrity**, not product acceptance.
Inspect `behaviors[].result.status` for runtime outcomes; valid reports may contain failed
or blocked runs. This permits reporting failures without hiding their evidence.

For a reviewer-accessible report, keep the checkout clean while generating it. Keep the
entire evidence packet outside the checkout or in an ignored directory until generation
finishes. Write the report to a temporary file outside the checkout, then copy it into the
packet; shell redirection directly into an unignored packet creates a dirty file before
the report checks source status and expires the selected pass.

```bash
coverage_report="$(mktemp)"
node scripts/verification-report.mjs --activity-run "<attempt>" \
  --source-prefix "https://github.com/BotHarness/DeepSeekBot/blob/<full-source-sha>" \
  --evidence-prefix ./verified > "$coverage_report" &&
  cp "$coverage_report" "<packet>/coverage.md"
rm -- "$coverage_report"
```

Publish the packet through the PR's existing evidence workflow. The report does not upload
files or redact an arbitrary input directory. Inspect screenshot/ARIA, authoritative reads
and diagnostics, remove private origins/paths/tokens before hashing, and verify shared links.
Local paths are not shared evidence. Bind the source SHA separately from the evidence commit.

## Maintain the inventory with the change

When changing a user entry, CLI contract, preparation/cleanup or expected result:

1. Update the feature map and affected journey together. Preserve first failures and refresh
   runtime evidence after the final source change.
2. Review each affected E2E file's actual setup, side effects and assertions. Update its
   classification, behavior associations, specific reason, tracking issue and SHA-256.
   A source hash is an audit reminder, not proof of semantic correctness.
3. Add/delete/rename its inventory row with the file. Never remove an unresolved file from
   the denominator to improve a percentage. `superseded` requires a replacement file;
   `needs-repair` and `undetermined` require a specific reason and associated task.
4. Give new behavior IDs unique, stable names and an existing implementation source.
   A missing recipe needs an explicit gap and issue; planned work stays out of this catalogue.
5. Run `node scripts/check-feature-map.mjs` (also in lint) and the report tests. The guard
   checks inventory completeness, hashes, links, associations and map consistency. Static
   success cannot verify UI, CLI semantics, model behavior or native devices.

Native provenance cites [#1919](https://github.com/BotHarness/DeepSeekBot/issues/1919) and
[#1954](https://github.com/BotHarness/DeepSeekBot/issues/1954), with separate source/evidence
SHAs, device, capture scope and outstanding checks. Recheck their latest handoffs when
updating those rows. Mobile Web export scripts are not native acceptance; all native work
uses the [shared device queue](device-qa.md). This report never claims that queue or a receiver.

## Temporary Workspace Grant evidence

Use `--workspace-run <attempt>` to select the separate
[Workspace Grant path](../../.agents/skills/verify-deepseekbot/features/workspace-grant.md).
It qualifies only authorization → direct attachment-import read → explicit revocation →
refusal for the same Bot/Workspace/Grant. Native file tools, Shell, #1841 and #1957 remain
outside that evidence. The Activity Center row stays unrun unless separately selected.

`--workspace-evidence-prefix` sets links for this path independently of `--evidence-prefix`
(Activity Center), so two selected runs never point at each other's files. Keep the entire
packet external or ignored and generate output to an external temporary file before copying,
as above. Inspect all three screenshots and ARIA snapshots before recording visual review.
