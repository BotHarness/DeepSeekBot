# DSH 0.2.2-rc.2 compatibility adaptation

Issue: [#4019](https://github.com/BotHarness/DeepSeekBot/issues/4019). Final release
artifact/platform acceptance remains in [#4024](https://github.com/BotHarness/DeepSeekBot/issues/4024).
This record qualifies the bounded native macOS checks below, not all Tobs 1.7.0 release gates.

## Frozen identities

- Official GitHub tag: `dsh-v0.2.2-rc.2`, source
  `ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c`, published 2026-11-11 UTC.
- Official macOS ARM64 Desktop: `deepseek-harness-0.2.2-rc.2-mac-arm64.zip`, obtained
  from `https://download.deepseek.com/dsh-desk/feeds/mac-arm64/nightly-mac.yml`.
  Archive size 362753775 bytes; SHA-512 (base64)
  `SAKrGOp6y3vla/r7QG6hP+y3LfHeRKS3xQ+lxFBuiF7ezSt+dqkCedm9znqKqr7akCkLgag0GnC+yZhkAWL/+Q==`.
  Feed digest and macOS deep/strict code signature verification passed.
- Actual rc2 Desktop boot identity: **0.2.2-rc.2 / a6b1b85**. This differs from the
  GitHub tag revision; the installed implementation was inspected independently.
- Previous official installed Desktop: **0.2.2-rc.1 / c59d10a**, tested with a separate
  task-owned Profile and user-data directory. The ordinary user Profile was untouched.
- Product baseline `eb80d3feb5ac9ed3d99a7acbbfb297c29a58d9c6`; fixed runtime source
  `40ee9940be3dd1b808eb7090edbf7ff869303196`. Native runs used linked development
  Bundles built from the runtime patch before commit; subsequent commit formatting
  and test/documentation updates do not turn these into published-package tests.
- SHA-256 of the shared built entries used on both Desktop versions:

| Entry                      | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| core `dist/index.mjs`      | `13970ec013ec699c0cfc46ee6b3a6c8baf3c5d19312176d46c4b4ff0df094f2a` |
| client `lib/client.js`     | `0f67184b92c744f685aeedfde5ea5317fa7540c1395036904e598085d495b04d` |
| CLI `dist/deepseekbot.mjs` | `3cbc00f9ac2c1317266fa144c6b7486e478d7055f81bae579ce6dc9a21777b9c` |

The official npm registry returned E404 for `@deepseek-ai/dsh@0.2.2-rc.2`, with an
rc1 control succeeding. Development pins remain rc1 and the admission floor remains
`>=0.2.0-0`. The matrix is not silently advanced to an unavailable npm distribution.

## Reproduced failures and adapters

1. Opening the Bot model picker on unmodified source under rc2 removed the Bot Client
   subtree. rc2 no longer exports `useAnchoredPosition`. Combobox and SessionStopPopover
   now share an adapter: retain the native legacy hook when exported, otherwise use
   CSS anchors. Native Menu receives the real `anchorRef`; older Menu also receives
   its `getAnchorRect` callback. Native dismissal, focus and menu ownership stay intact.
2. A real Assignment called `bot_subagent` twice and failed with
   `Cannot read properties of undefined (reading 'id')`. The installed rc2 Subagent
   manager reads `spec.parent`, while rc1 reads `spec.request.parent`. Both shapes are
   now supplied in **one** activation call. Cancellation, result delivery and disposal
   ownership are unchanged; a native refusal never retries through another API.
   The model's suggestion that a missing Model Preset caused this failure was incorrect.

The rc1 tool execution/presentation, Control Rail, desktop zoom, Session persistence,
Browser/Computer and Provider patches are retained. This change neither removes them
nor claims that a successful startup requalifies every patch. Actual append/persistence
worked in the recorded model and child journeys; a complete overload and Provider audit
remains part of final-artifact qualification.

## Native runtime evidence

Real macOS Electron windows were driven through their actual controls and keyboard,
with CLI traces from the same authenticated Host used to verify tool calls. No platform
spoofing, fake model response or child-result substitution was used.

| Journey                                          | rc2                                  | rc1                                  |
| ------------------------------------------------ | ------------------------------------ | ------------------------------------ |
| Fresh isolated Profile, linked Bundle, Bot mode  | PASS                                 | PASS                                 |
| Real DeepSeek reply and native Memory write/read | PASS                                 | PASS                                 |
| Assignment and report delivered to Bot DM        | PASS                                 | PASS                                 |
| Foreground native child                          | PASS: 37 × 41 = 1517                 | PASS: 17 × 19 = 323                  |
| Background native child and completion delivery  | PASS: 43 × 47 = 2021                 | PASS: native start and result report |
| Native fork child                                | PASS: 11 × 13 = 143                  | PASS: 31 × 3 = 93                    |
| Same-Profile restart and native Memory reread    | PASS                                 | PASS                                 |
| Model picker opens and displays real options     | PASS                                 | PASS                                 |
| Escape returns focus to model input              | PASS                                 | PASS after native dismissal settles  |
| Actual native window 850 × 600 and 1261 × 820    | PASS: options remain within viewport | Not separately measured              |

These are agent-driven native checks, not Human acceptance. They are not packed
fresh-install, published 1.6.1 upgrade, Windows, iOS or Android qualification.

An attempted rc2-Profile downgrade to rc1 failed while reading the new versioned
`subagent/catalog` fact. Preserve this failure: rc1 cannot read that rc2 Session log.
The rc1 compatibility runs above used a fresh Profile instead; no production data was
migrated or repaired. Driver failures from hidden/narrow-layout controls, the rc1
contenteditable editor and an early restart port race were retained and corrected
before collecting successful evidence.

## Checks and performance impact

- Build, lint, format check, root/mobile typechecks and bilingual release-fragment checks passed.
- Focused Client tests: 15 passed with rc2's missing hook represented by the native mock.
- Public Subagent foreground/background regressions: observed RED before the adapter,
  then 35 tests passed across tool/runtime/wake suites.
- Lifecycle/legacy/refusal adapter tests: 7 passed after updating two obsolete exact-shape
  expectations; cancellation remains exactly-once and native failures are not retried.
- Full suite: 13937 passed, 73 skipped, four failures. Two were those exact-shape
  expectations; the other two were unchanged stress/docs build timeouts. Isolated reruns
  passed all four stress tests in 10.69 seconds and the docs test in 16.31 seconds, using
  the original 15-second/120-second limits. The full-run failures remain recorded.
- An earlier restricted run could not exercise local server tests reliably and was
  stopped. The recorded full run permitted loopback HTTP/WebSocket servers.
- Independent standards and spec reviews found no confirmed implementation defect;
  constrained viewport and older-native evidence were explicitly requested and collected.

No dependency or feature is added. Subagent dispatch adds a bounded request-field copy
without another invocation; the existing call-count, cancellation and refusal tests guard
this path. Modern anchored positioning adds no polling or resize observer; the legacy
Host retains its existing hook. Native geometry checks guard the affected popup placement.
No latency or frame-rate improvement is claimed, and performance budgets are unchanged.

## Evidence and release boundary

Private indexed evidence is retained under the main checkout task folder
`.humanlayer/tasks/dsh-022rc2-qualification/`: original failure reports, native traces,
geometry captures, artifact identities and resource ownership. Only privacy-reviewed
screenshots are published with the PR. Raw Profile, credentials, logs and paths are not
public artifacts. Task-owned processes are stopped after acceptance; retained Profiles
are evidence, not running QA services.

[#4024](https://github.com/BotHarness/DeepSeekBot/issues/4024) owns final packed artifacts,
minimum/previous runtime matrix, unavailable npm rc2, remaining zoom/menu/Control Rail,
Browser/Computer/Connect/IM, Windows and release-required mobile/Human gates. A merge of
these compatibility fixes does not publish Tobs or declare those gates passed.

## Packed qualification follow-up (#4024)

The release coordinator confirmed that Tobs 1.7.0 is **not yet frozen**. The
qualification-only candidate starts at `284ab894effb3451b9e6fff88884b0b84f65ebb8`;
neither these test versions nor their installation authorize publication. Keep
the previous #4019 linked-source results separate from the packed runs below.

### What rc2 changed, and why Tobs is affected

The [official release notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.2)
describe new Worktree review, named/nested Subagents and Desktop update channels,
along with UI, model, tool, Computer Use and Session changes. This is a prerelease
with documented migration work, not a promise of unchanged Plugin APIs. The
[tag comparison](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.2-rc.1...dsh-v0.2.2-rc.2)
and actual distribution must both be checked; a truncated GitHub file listing is
not a complete interface audit.

The reproduced Tobs failures cross three different seams:

| Seam                           | Change and observed consequence                                                                                                  | Adaptation                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Native Client primitives       | Removed positioning hook and Menu anchor API change; opening the old model picker crashes the Bot subtree                        | #4025 preserves the old hook when available and uses CSS anchors/new refs on rc2       |
| Native Subagent activation     | rc2 reads the parent and request fields at the top level; the previous nested-only request fails at `parent.id`                  | #4025 supplies both representations in one activation, without execution retries       |
| Optional Desktop theme payload | The opt-in zoom adapter only had reviewed rc1/older payloads; actual rc2 enable refuses `desktop-zoom-setup-version-unsupported` | #4024 adds the exact rc2 theme input and transformation; unknown versions still refuse |

On 2026-11-11 UTC, both the npm rc2 CLI and theme package still returned E404.
The signed official macOS arm64 archive is available and reports boot commit
`a6b1b85`. Its public GitHub tag remains a separate identity. The checked-in rc2
theme runtime input carries its MIT license and per-file provenance; its native
Desktop distribution omits declaration files. Builds do not fetch a moving feed
or substitute the rc1 payload. The adapter verifies both entry-point hashes before
changing the same owned font-shortcut scope as earlier versions.

### What protects a future upgrade

The admission floor `>=0.2.0-0` permits installation; it does **not** certify
0.2.3 or an untested prerelease. Existing capability adapters and
[ADR-0316](../adr/0316-host-capabilities-degrade-or-fail-with-host-incompatible.md)
provide local degradation/refusal at known boundaries. They cannot predict a
method that keeps its name while changing its argument or persistence contract.

The current scheduled canary watches npm `next`, starts a linked Bundle and checks
that a Bot turn reaches the model. Missing credentials can count as setup success.
It does not watch the independent Desktop feed, operate model menus, complete a
native child, or qualify published product bytes. Its pass cache is keyed by DSH
version, not the full product/artifact tuple. Thus its green status could not cover
this Desktop-first release or the two reproduced interaction failures.

For release decisions, retain these distinct controls:

1. Track npm and official Desktop artifacts independently, including digest and
   actual boot identity. A newly discovered distribution starts a new qualification;
   a version-only cache is not release acceptance.
2. Exercise the published Tobs version first, then one frozen candidate on the
   oldest concrete supported runtime, previous baseline and new runtime. Include
   Client interactions, real model/native-child completion and restart, not only
   Host health. The command below selects the current published upgrade fixture
   without erasing historical 1.4.1 coverage:
   `node scripts/e2e-fresh-profile-install.mjs <artifacts> <fresh-output> --upgrade-from 1.6.1`.
   `--dsh-version` and `--upgrade-only` explicitly bound a rerun.
3. Keep upstream-sensitive contracts in narrow adapters and test observable old/new
   behavior. Optional failures must not tear down unrelated chat; required failures
   must retain a concrete diagnosis, not retry side effects through another API.
4. Before a Host update, preserve a closed, consistent Profile backup and known-good
   application/runtime artifacts. Do not reopen an rc2-written Subagent catalog in
   rc1 as a rollback strategy. Restore the pre-update snapshot in a separate Profile.
5. Use the Desktop's release channel deliberately and hold an unqualified update
   when stability is required. Tobs does not currently intercept the upstream
   updater or guarantee that an unknown future Host remains usable.

The additional discovery and full-artifact canary coverage above is a required
follow-up in [#4026](https://github.com/BotHarness/DeepSeekBot/issues/4026),
**not a claim that those automated gates have shipped**. Existing
adapters reduce breakage; only artifact-bound runtime evidence establishes the
tested tuple. Windows, native mobile, external IM and Human acceptance stay separate.

### Performance boundary

The new theme is a separately packaged, opt-in replacement for the matching native
Desktop theme, not an additional Client bundle or a new per-message operation.
The adapter retains one owned shortcut lease and restores the native handlers on
release. Existing shortcut ownership/disposal tests remain the regression guard;
the package tests additionally check all pinned rc2 inputs and parse the transformed
Client entry point. Native zoom levels -1/0/1/2 preserve the root font tokens and
keep the model selector inside the viewport. These are correctness checks, not a
frame-rate or end-to-end performance claim. The added payload increases download
and installed size; it is not a performance improvement.
