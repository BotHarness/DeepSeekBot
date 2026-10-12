# DM composer delivery evidence — #1432

Scope: [#1432](https://github.com/BotHarness/DeepSeekBot/issues/1432), under [#1431](https://github.com/BotHarness/DeepSeekBot/issues/1431). Base revision: `73c75f86aa50767be34a5c8d2cadc17b6a3e8862`. The PR identifies the exact candidate head. Task: `codex/local/01a12bd8-2d31-7ae1-9fc1-8bf1ba5d6e45`.

## Ownership and review focus

```text
DM ChannelComposer: fixed local / actions, draft and attachment owner unchanged
  model → existing ModelPresetProfile → PersonaBot model plan
  workspace → existing WorkspaceGrantsEntry → confirmed scoped Grant
  companion → existing WindowCompanions owner ← existing header pin
  usage → shared header ProfileActivity snapshot → existing Profile view
```

The menu is an application-defined UI entry point, not a model command protocol. No schema, Host endpoint, statistics authority, permission mode, navigation or Group extension is added. Model and Grant chips subscribe to the existing change owners; late responses are fenced by scope/unmount. The header and composer share one 26-week Bot activity snapshot and the same ready/unknown/partial/unavailable formatter. Refresh is bounded to completed message changes, Profile opening and a 30-second timer; loading/failure never invents zero usage.

Composition borrows a compact context row and input-adjacent menu, adapted to DSH tokens and the existing composer. Existing Modal, Button and model/Grant editors are reused; menu/context controls deliberately use compact semantic native buttons rather than the larger capsule Button. Original sidebar entries and header pin remain available. Shared Bot main/CSS/locale edits are limited to composer wiring, the shared activity reader and translations, keeping #1434's navigation scope separate.

## Automated verification

- Merge-preparation review follow-up removes only the unconditional activity reset: an in-flight refresh retains the same-Bot snapshot, while failed queries still mark data unavailable and channel-key/cancellation/slug fences remain unchanged. Bot main/composer/token regressions: **three files, 21 tests passed**; typecheck, lint, scoped formatting and build passed. The maintained English architecture source is synchronized through `scripts/sync-docs.mjs`; generated docs remain uncommitted. Earlier real Host E2E and screenshots below belong to the preceding slice/visual follow-up, not a new runtime rerun of this refresh refinement.

- Original slice Client suite at `2c6790fc`: **167 files passed, one skipped; 1216 tests passed, one skipped**. Existing jsdom navigation warnings are not browser runtime failures.
- Focused regression after the collapsible follow-up: **eight files, 54 tests passed**, covering slash filtering, ordinary prose/path slashes, Enter/Tab/arrows/Escape, pointer selection, target changes, draft/attachment preservation, model-store synchronization, scoped Grant confirmation/cancellation/reuse, preview failure readback, Companion readiness/preference restoration, usage states and sidebar-style native disclosure.
- Typecheck, lint/source policy, formatting, build and bilingual Release Ledger checks passed.
- Original slice full repository suite at `2c6790fc`: **488 files passed, one failed, seven skipped; 4114 tests passed, one failed, 13 skipped**. Not green: `scripts/test/dev-im-test-apps.test.mjs` synthetic-stdin setup test exits 2 instead of 0. The same single-test failure reproduces at the exact detached base revision (six tests pass, one fails); its source is unchanged by this PR. No unrelated script fix is included. The style-only follow-up reran focused tests and token guards, not the entire repository suite.
- CI and Human QA are separate gates; local results do not claim either.

## Real isolated Host E2E

Verified on the worktree-pinned DSH `0.2.0-rc.1` with a task-owned Profile and loopback port, without touching other running instances. Credentials, paths, raw Profile/database/session files and local login URLs stay private.

1. Opened `/model` from the DM composer, saved `deepseek-flash` through the existing editor, and observed the composer chip and original sidebar Model entry synchronize. A real subsequent DM returned `COMPOSER_MODEL_OK`; persisted usage identifies the selected model.
2. Previewed a directory, checked the Bot/resolved-directory/access confirmation, then cancelled: zero Grants. Confirmed the same directory and repeated it: one existing Grant, not a duplicate; Orchestrator-write remains off and no Assignment-access override is created. Directory preview does not publish a mutation or dismiss its pending confirmation.
3. A real later delegation through the existing Host `create_assignment` tool wrote `proof.txt` containing exactly `COMPOSER_WORKSPACE_OK` plus newline (22 bytes) in the authorized fixture. The Assignment completed; persisted usage contains both Orchestrator and Assignment rows for `deepseek-flash`. Two explicit **Allow once** approvals were used only for read-only file verification (the first command used an unsupported BSD flag); no permanent rule or preset was changed.
4. A real request targeting a different ungranted fixture received the Host refusal `Workspace Grant is missing or revoked`. No Assignment/file was created for that fixture; the expected denied proof file is absent. The Bot did not request authorization or substitute its Memory workspace.
5. Composer `/companion` remove/show and the original header pin synchronize bidirectionally. Actions preserve a synthetic draft and uploaded `composer-proof.txt`; reload restores the Companion selection through its existing Profile-local preference. Reload is not claimed to persist the unsent draft/attachment.
6. Header Profile and composer simultaneously displayed **353504 tokens over the same 26 weeks** for the same Bot; the summary opens the existing detailed Profile view. This is measured historical use, not context-window occupancy or streaming estimation.

The isolated macOS native directory picker initially refused browsing as unavailable. The QA Profile switched only its picker implementation to the installed official Host/Client browse providers, then completed real directory preview/confirmation and delegation. Native-picker fallback and mutation-error readback are covered by focused tests, not claimed as a successful real OS dialog run.

## Visual evidence and limits

Committed PNGs under `1432-dm-composer/` are real rendered UI crops with synthetic data. They intentionally omit unrelated conversation previews, local paths and identifiers. Before shows the prior entry-point/absence state; after shows the new menu/context row. Before/after use the same composer surface, theme and captured image dimensions; configured model/Grant/usage changes in the ready-state after are labeled, not represented as identical fixture data.

Desktop English light/dark captures are browser evidence, not physical-phone or Safari acceptance. Chinese was selected through the real shell settings; DOM verification showed translated menu actions, chips and the existing Profile details reached from the summary. Initial final Chinese/dialog capture and narrow/touch verification were blocked by T3 snapshot/resize failures. PNG capture recovered during the follow-up: the Chinese Workspace Grant editor is now captured both expanded and collapsed. The original dark pair remains the composer before/after evidence; ready-state dark/light images are supplemental, not matched light before/after. No standalone headless capture is represented as T3 evidence; no physical-device or narrow/touch result is inferred from the Human's general functional acceptance.

### Human-requested collapsible follow-up

The Human reported that functional testing found no issue, then requested the Channel sidebar disclosure design in the Workspace Grant editor. All folder secondary sections now reuse `bh-channel-sidebar-entry-head`, `bh-channel-sidebar-entry-label` and the same 14px `IconChevronDownOutlineRegular`/150ms rotation. Native `details`/`summary` keyboard and toggle behavior remains; the browser triangle marker is hidden. No authorization/state-owner behavior changes.

The Human-provided annotated before image is cropped to the dialog (`workspace-before-human.png`); `workspace-after-open.png` and `workspace-after-closed.png` are fresh T3 captures on the task-owned Host. They use the same Chinese editor/fixture, but the Human's image has a different zoom/capture scale; this is labeled rather than presented as a pixel-matched pair. Crops exclude background conversation paths. Real DOM/CSS inspection confirms marker `none`, 14px glyphs, no expanded rotation and -90-degree collapsed rotation. Focused editor/token guards: **two files / 26 tests pass**; the wider eight-file focused suite, typecheck, lint, format, build and bilingual ledger checks also pass.

T3 browser console snapshots during the main E2E had no displayed console errors; canceled streams/diagnostic requests during navigation are not claimed to be a completely clean network trace. The detailed HTML explainer is generated locally against the exact PR head; no authorized shared HTML hosting path was used. This Markdown evidence is reviewer-accessible, but the local HTML is not claimed to be shared or runtime proof.

## Human QA reproduction

### Composer usage-popover refinement (2026-10-12)

The follow-up keeps icon + label controls, places model/workspace-count controls on the left and compact token totals on the right, and opens a read-only Session usage popover rather than navigating immediately. Only its bottom details button opens the existing Profile view. The popover borrows the supplied Claude reference's compact rounded panel and grouped rows, not its quota or context-window percentages.

- **Automated:** six focused files / 158 tests pass; the wider Client plus Usage/Bridge suite reports 170 passed files, one skipped file, 1301 passed tests and one skipped test. These are scoped suites, not a claim that the full repository suite passes. Coverage includes compact K/M/B boundaries, icon/layout structure, details-only navigation, Escape/focus restoration, stale Bot responses, RPC scope/row selection/parser bounds, inherited-prefix filtering and no usage writes.
- **Real isolated Host:** the task-owned pinned Host was rebuilt/restarted without touching another instance. The real Chinese DM DOM shows `deepseek-flash`, `1 个工作区` and `353.5K tokens`; measured model/workspace group is left of the token button. Clicking token opens the actual dialog with aggregate `353.5K`, Orchestrator `293.4K`, and recent Assignment `60.1K`, using native persisted Session facts. No Profile dialog opened on that click. These rounded counts match the previously measured aggregate of 353504 and its 293432/60072 split; they are not invented fixture totals.
- **Evidence limitation:** T3 snapshot failed for the existing tab and a fresh tab; resize and subsequent keyboard/evaluate/open calls timed out, and `preview_status` then reported `available:false`. No alternate browser driver was used. New popover PNGs, narrow viewport, real Escape/outside/details interaction and draft/attachment rechecks remain unverified in this follow-up. Existing committed screenshots below remain historical evidence for their original heads, not screenshots of this refinement. The native diagnostic collector observed shell-ready in the fresh document and shell-lost in the earlier document; this is not a claim of an error-free browser console.
- **Human QA:** prior functional acceptance and merge authorization preceded this new UI. The PR stays Draft with merge paused pending acceptance of this refinement and completion of the missing visual/interaction evidence. No merge, deployment, #1433 or navigation work is performed.

### Recovered capture and latest Human feedback

The collaborative preview recovered after the above historical blocker. The current follow-up removes the two verbose explanations, adds relative Session bars, and separates the details button from the divider. Percentages divide each known ready/partial row by the sum of known counts in the displayed Sessions; they are Client presentation, not quota, context-window capacity or a new statistics authority. Unknown rows and a zero known total have no percentage meter. The Human has accepted the progress bars; this is not blanket acceptance of subsequent header/detail changes.

- Current focused validation: six files / 68 tests pass, including the Core gateway registration expectation, composer percentage/zero-total regression, Profile lifecycle, Memory commit/file return path, tokens/styles and Companion tests. Typecheck, lint/source policy, scoped format, build and bilingual ledgers pass. Existing unrelated lint warnings remain.
- CI at `85ff38dc6d75b825705ab3ca475d59f3ba5c16c9` failed because the Core gateway test expected-array omitted the newly registered `profileSessionUsage` RPC (4141 passed tests, one failed, 13 skipped). This follow-up corrects that owned expectation; it is not the earlier synthetic-stdin failure. New-head CI must be read separately.
- Real isolated pinned Host: Session values remain 293.4K / 60.1K, with relative bars 83% / 17% and aggregate 353.5K. The details button is 40px high with symmetric 10px vertical padding and a 13px gap below the divider. Escape restored usage-trigger focus; outside dismissal and explicit details navigation were observed before the latest header-only change.
- At the final built UI, native DOM button actions through the real React handlers opened Profile and Memory file views: the chat topbar and fade are hidden, and Memory file still hides the timeline/composer like commit details. Profile uses the complete body, not an extra chat-header inset. Returning from usage details preserved an exact multiline synthetic draft and attachment without sending. Final actions used DOM clicks because T3 semantic clicks intermittently reported success without activating the target; do not treat these as pointer/hover qualification.
- Real header geometry: identity and pin are both 34px tall with the same 10px top coordinate; both have opaque native module backgrounds. The pin screenshot shows a real `:focus-visible` state. Opaque hover composition has source regression coverage; new real pointer-hover acceptance remains Human QA.
- Screenshots are cropped real captures, not mockups. Popover before/after use Chinese, dark theme, the same native totals, and a 1402×877 DOM viewport rendered to 1280×800; changed height is intentional. Profile dark before/after use the same state and crop. Light usage is supplemental. Memory file and header before images are Human-supplied crops at different zoom; they are not pixel-matched pairs. No narrow/mobile acceptance is claimed; resize continued to fail. Background chats/paths and private Profile/login material are excluded.
- Browser console entries were empty on successful snapshots; canceled diagnostic POSTs were present. This does not claim a perfectly clean network. No provider/model/Grant/Companion E2E is relabelled as newly rerun.

New evidence: `1432-dm-composer/usage-before-dark.png`, `usage-after-dark.png`, `usage-after-light.png`, `context-after-dark.png`, `profile-before-dark.png`, `profile-after-dark.png`, `memory-file-before-human.png`, `memory-file-after-light.png`, `header-pin-before-human.png`, `header-pin-after-light.png`. PR embeds and GitHub rendering are verified separately from local image inspection.

Reproduction: open a Bot DM with an existing Orchestrator and Assignment history; verify icon-labelled left model/workspace count and right token count. Click tokens, compare relative Session rows with existing Profile details, dismiss by Escape and outside click, then use the separate details button. Open Memory files/commit details and return to Chat, checking the overlaid chat header is absent from each detail view. Repeat with a multiline draft and attachment without sending, both themes and your target viewport. Missing Session logs must remain unavailable/unknown rather than zero.

1. Launch a new isolated Profile using the repository dev-instance helper and the pinned CLI; use your own authorized model and disposable workspace. Do not reuse another session's port/receiver.
2. In a Bot DM, type a multiline draft, attach a file, then `/`. Exercise model/workspace/Companion via keyboard and pointer, cancel each editor, and confirm draft/attachment survival. Ordinary prose and path slashes must remain message text.
3. Save a model, send a normal DM and verify its real reply; compare the chip with the original Model entry.
4. Preview and cancel a folder, then authorize it explicitly and repeat: same Grant, no mode/rule elevation. Delegate one bounded operation there and verify a separate ungranted directory still fails.
5. Compare summary and header Bot/26-week counts, click into the existing details, then return to Chat. Toggle Companion from each entry and reload to check the existing preference.
6. Review light/dark, zh/en, wrapping and touch on your actual target devices. Group/navigation changes are out of scope.

**Human-reported functional QA passed.** The requested visual follow-up is posted for review; device-specific checks are not inferred. One issue/PR only; pause after the PR update. No merge or #1433 work is authorized by this delivery.
