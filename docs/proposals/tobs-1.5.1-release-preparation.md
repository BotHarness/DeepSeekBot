# Tobs 1.5.1 release preparation

[中文](tobs-1.5.1-release-preparation.zh.md) · [Tracking issue #2751](https://github.com/BotHarness/DeepSeekBot/issues/2751)

Status: preparation only; publication is on hold. Proposed version: **1.5.1**.
This is a release-scope checklist, not a frozen Release Plan or publication approval.
Follow the existing [version policy](../agents/version-policy.md) and
[Release Ledger procedure](../agents/changelog.md).

## Verified starting point

Checked on 2026-10-25 JST:

- npm has `deepseekbot@1.5.0`; `@botharness/tobs` returns package-not-found.
- [#2744](https://github.com/BotHarness/DeepSeekBot/issues/2744) records the partial
  1.5.0 publication and existing `v1.5.0` tag. Preserve that tag and published bytes.
  A GitHub Release for `v1.5.0` was not found; npm publication and GitHub announcement
  are separate states.
- [#2747](https://github.com/BotHarness/DeepSeekBot/pull/2747) is open and supplies
  the scoped package correction. Its 1.5.0 recovery workflow must not be dispatched
  under the earlier automatic-publication authorization.
- [#2750](https://github.com/BotHarness/DeepSeekBot/pull/2750) is merged. The iOS
  Chinese display name is **托布 Tobs**; English remains **Tobs**. This does not
  synchronize mobile version/build counters with npm or authorize mobile delivery.
- Public install identity remains `1.4.1` in `scripts/install-release.json` until a
  published candidate is qualified. Do not advance it during preparation.

## Intended package alignment

The proposed next release publishes `@botharness/tobs@1.5.1` and
`deepseekbot@1.5.1` from the same qualified source and frozen artifact inventory,
with product-owned components on the same version according to the version policy.
Keep the independent Provider, DSH, tools/Skill and mobile versions independent.

The scoped package can start at 1.5.1; it does not need a preceding 1.5.0 release.
A wrapper-only supplement could have used 1.5.0, but changed product bytes after
additional merges require a new release identity. Preserve the existing
`deepseekbot` package and command; introduce the scoped entry without deprecation.
Recheck SemVer against the final diff: 1.5.1 is provisional, and newly added
functionality or breaking behavior may require a different version under policy.

## CLI compatibility and documentation readiness

The scoped-package implementation in #2747 exposes `tobs` and delegates to the
same-version `deepseekbot` CLI. It does not expose a second global command merely
because `deepseekbot` is a dependency.

| Global npm installation | Expected commands on PATH                             |
| ----------------------- | ----------------------------------------------------- |
| Only `@botharness/tobs` | `tobs`                                                |
| Only `deepseekbot`      | `deepseekbot`                                         |
| Both packages           | Both commands; match versions for equivalent behavior |

Installing a Bundle through DSH is separate from installing a global npm CLI;
the plugin-install instructions must not promise a shell command on PATH.

Before requesting publication approval, prepare reviewed changes for these surfaces:

- New-user installation and command examples use `@botharness/tobs` and `tobs`.
  Retain a clearly labelled compatibility path for the `deepseekbot` package and
  command. Never pair a new-package-only global install with unexplained
  `deepseekbot ...` examples. Do not recommend the rejected unscoped npm package.
- Update bilingual README and npm README copy, `docs/bot-cli.md` and
  `docs/bot-cli.zh.md`, installation/upgrade guides, website copy buttons and their
  command sources. Explain installation requirements and same-version command
  equivalence once at the CLI reference entry; audit linked runnable examples.
  Historical release records and code/protocol identifiers retain their names.
- Make installation synchronization package-aware: the current synchronizer
  hard-codes `deepseekbot`, so changing only the version cannot select the scoped
  package. Keep the current published install identity until registry qualification.
- Update canonical source documents and synchronize generated docs through the
  repository's existing scripts. Prepare the matching `deepseekbot-site` changes
  in its own PR; do not edit generated docs or switch the live website early.

Qualify the final tarballs on Windows and Linux with separate clean global-install
prefixes for each single-package case, then test same-version coexistence, both
uninstall directions, explicit `npm exec --package=... -- <command>` entry points,
help, representative subcommands and refusal/exit-code parity. Confirm that copied
documentation commands select the intended package/version. Existing coexistence
tests do not alone prove that installing one package exposes both commands.

This checklist adds documentation and verification requirements, not new CLI aliases
or a claim that the website migration or final-artifact tests have already passed.

## Required gates, in order

1. **Wait for #2435 to close.** Its
   [selected communication direction](https://github.com/BotHarness/DeepSeekBot/issues/2435#issuecomment-6387781599)
   is evidence for the owning implementation, not production qualification. The
   isolated experiment does not replace real Host/Channel delivery checks. Neither
   that comment nor merging its related PR alone satisfies this gate: re-read the
   issue state and closure evidence. Reopening the issue blocks the release again.
2. Merge the reviewed scoped-package correction in #2747, or an explicitly linked
   replacement. Merging it does not authorize its 1.5.0 recovery publisher. Confirm
   with the Human that the prerequisite list is complete before freezing scope.
3. On the final merged source, recheck the version, fold bilingual fragments and
   review release notes through the existing release-preparation procedure. Record
   exact source and artifact checksums in the actual frozen Release Plan. Qualify
   fresh install, upgrade/restart and supported command coexistence against that
   candidate. Earlier 1.5.0 or fixture-only evidence does not qualify new bytes.
4. **Stop for explicit Human publication confirmation.** Present the final version,
   source, package inventory, validation results and unresolved limits. CI success,
   automatic review, issue closure and PR merge cannot substitute for this approval.
   The Human's hold supersedes the older automatic 1.5.0 recovery authorization.
5. Only after that confirmation, execute the approved publication using the existing
   release gates. Read back registry versions/integrities, qualify published bytes,
   then advance install identity and derived guidance through their reviewed sync.

## Preparation boundary

This preparation PR changes only this bilingual checklist. It creates no release
artifacts, tag or GitHub Release; publishes no npm/mobile artifact; moves no npm
channel; and changes no package manifest, ledger release heading or public install
identity. No automatic publication continuation is authorized.
