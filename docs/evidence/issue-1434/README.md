# #1434 — Mobile Bot-mode navigation evidence

Task: `codex/local/01a12be6-bca2-79c0-8651-e63c72476072`.
Claim: [issue comment](https://github.com/BotHarness/DeepSeekBot/issues/1434#issuecomment-6111442834).
Baseline: `73c75f86` in a separate detached checkout. Captured on October 12, 2026.
Only synthetic conversations from task-owned isolated Profiles are shown; no production receiver
was changed. This is Client navigation/layout work, independent of #1432.

## Captures

The mobile browser measured **427 × 925 CSS pixels**, despite a requested 390 × 844 preset.
The desktop browser measured **1402 × 877 CSS pixels**. The files are original screenshots;
image pixels are not CSS viewport measurements. All pairs use English and the native dark theme.

| View          | Before                                                      | After                       | Interpretation                                                                                                            |
| ------------- | ----------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Bot DM        | [Before](before-dm.png)                                     | [After](after-dm-draft.png) | Same real Channel messages; after additionally shows the restored unsent DM draft.                                        |
| Group         | [Before](before-group.png)                                  | [After](after-group.png)    | Same real Channel messages and long Group name, without the native sidebar occupying mobile space.                        |
| Conversations | [Prior rail / absence of full-width list](before-group.png) | [List](after-list.png)      | The new full-width entry has no direct baseline predecessor. Thirty synthetic archive groups exercise scrolling.          |
| Desktop Group | [Before](before-desktop.png)                                | [After](after-desktop.png)  | Layout-only comparison: the after capture is still loading messages. It does not prove desktop message loading completed. |

Captures precede the final nonvisual viewport guard and test additions. Those changes do not
change the rendered layout. A final browser recapture was blocked by collaborative-preview
timeouts; do not interpret the screenshots as a new exact-head runtime rerun.

## Verified categories

### Mobile presentation polish — October 12, 2026

Six bounded Human-requested fixes: ellipsize only the empty mobile composer hint; hide the
duplicate Activity Center content title; keep expanded search inside its slot; reuse the
selected Bot-mode identity for Exit; use a three-line conversation menu; and keep mobile
sidebar display settings at the right inset instead of the desktop offset. Existing actions,
message wrapping, full accessible names and desktop presentation are preserved.

Matched dark/English captures below use the same synthetic Group and isolated Host. Before
is `8581f2da`; after is the presentation polish build. The actual iframe viewport is 427 × 925
CSS px, externally scaled to .82; screenshots are cropped to the app's top-left 320 × 693 image
pixels without retouching. Companion overlap is left visible and still requires Human QA.

| View                           | Before                                  | After                                 |
| ------------------------------ | --------------------------------------- | ------------------------------------- |
| Search border / Exit identity  | [Before](before-polish-search.png)      | [After](after-polish-search.png)      |
| Empty long-name composer hint  | [Before](before-polish-placeholder.png) | [After](after-polish-placeholder.png) |
| Activity title / existing tabs | [Before](before-polish-activity.png)    | [After](after-polish-activity.png)    |

- At 390px, search and slot both span 12–330px, with zero horizontal overflow; at 427px,
  they span 12–367px. Settled finite header animations were finished through the browser API.
- The real empty editor computes `nowrap` / `ellipsis` / `overflow:hidden` for its placeholder
  only, while the complete Channel name remains in `data-placeholder` and `aria-label`.
  Unsent multiline input keeps `pre-wrap`; it was cleared without sending.
- The mobile Activity content h1 computes `display:none` and existing tabs remain visible.
  At 1402px desktop width its h1 computes `display:block`, without mobile navigation.
- The three-line conversation menu retains its existing accessible name and sidebar action.
  The mobile sidebar display-settings button spans 391–419px in the 107–427px sidebar,
  preserving an 8px right inset; its existing Edit sidebar menu opens. Desktop retains 44px.
  [After sidebar inset](after-polish-sidebar.png) is an additional after-only view; no synthetic
  reconstruction or Human-uploaded screenshot is presented as a matched before capture.
  The placeholder after-image predates the final three-line menu icon change; its hint layout
  is unchanged. Final conversation recapture returned `PreviewAutomationExecutionError`.
  The menu SVG/action was checked in the live DOM, not claimed as new visual approval.
- **Focused tests:** 10 files / 94 tests pass; typecheck, lint, format and build pass.
- Focused coverage and current build checks are recorded in the PR. No new DM/Group sends
  were made for this presentation-only follow-up; earlier real roundtrips remain separate.

These new screenshots supersede the earlier screenshot-capture blocker for these three
views, not the physical-phone/Mobile Safari, keyboard, nonzero-safe-area or native-rotation
Human-QA gates. Historical images and verification records below remain explicitly separate.

### Human-requested IM header refinement — October 12, 2026

The follow-up removes the duplicate list/conversation headers: the existing list header owns
search, More, create and Exit; conversation headers contain only Back icon, full accessible
Channel name and Channel settings icon. The three top-level bottom destinations use icons
with translated accessible names. Conversation bottom-bar hiding remains provisional.

The task-owned Host was rebuilt with this refinement. Browser checks use the real app in a
same-origin iframe with measured CSS viewports of 390 × 844, 427 × 925, 844 × 390 and
1402 × 877. The outer frame is scaled to fit the preview; this is browser layout testing,
not device emulation, Mobile Safari or physical-phone proof. Existing DOM controls were
clicked, and composer/search input events were dispatched in that frame; no Channel API
was used as a substitute for the composer. Finite header transitions were finished through
the browser animation API for settled-state measurements in the inactive preview.

- At 390px, closed-header Search/More/New/Exit bounds were 189–233 / 237–281 / 285–329 /
  333–377px, with no overlaps. At 427px the same controls were 226–270 / 274–318 /
  322–366 / 370–414px. Expanded search keeps Exit reachable and filters the actual Group row.
- Fresh visible-composer DM and Group sends produced visible `HEADER DM OK` and
  `HEADER GROUP OK` Channel replies from the real Host. The previous canonical readback
  belongs to the original roundtrip, not this additional navigation-only check.
- Back restored list scroll at 862.5px; DM and Group unsent drafts stayed distinct.
  The long Group title truncates visually while its full text remains in the heading/title.
- Channel settings opens the existing Members / Wake policy / External connectors /
  Group management sidebar. Its display-settings menu remains visible; backdrop dismisses it.
- At 844 × 390, both header controls and the composer fit the viewport with zero horizontal
  overflow. At 1402 × 877, the mobile shell/sidebar mark are removed, native navigation
  returns, and the real DM history and draft load. Returning to mobile starts on the list.
- Activity Center and Bot Settings both loaded their existing content. Exit removed the
  shell/sidebar mark and restored the native Host layout.
- Refinement checks: 9 focused files / 75 tests passed (mobile panel, panel entry, bundle,
  token guard, Bot main, mode, composer, composer lifecycle and Group composer activity).
  Typecheck, lint, format check, bilingual changelog check and build passed. This is a new
  focused selection, not a claim that the previous local full-suite failures disappeared.

**Capture blocker:** the collaborative browser's screenshot operation repeatedly returned
`PreviewAutomationExecutionError`, including on a new preview tab. DOM/runtime observations
above are not visual approval. The seven committed images remain historical pre-refinement
captures; they must not be described as screenshots of the new header. Recapture the refined
list, DM, Group/settings and desktop in matched theme/locale/viewports before visual approval.
The earlier seven-image GitHub page render was verified separately on head `0b0e16c2`.

### Original implementation verification

- **Focused automation:** 7 files / 100 tests passed, including navigation, stable list node and
  scroll, draft isolation (text, mentions, reply, Channel refs and uploads), late send-failure
  restoration into the original scope, viewport listener disposal, desktop shadow restoration,
  bundle contract and absent-browser initialization.
- **Checks:** typecheck, lint (existing warnings), format check, bilingual release-ledger check
  and build passed.
- **Real isolated Host:** sent from the visible current composer to Bot DM and Group; both
  produced real provider-driven `channel_send` responses, `MOBILE DM OK` and `MOBILE GROUP OK`.
  Canonical Channel readback and visible messages were both checked. The earlier no-tool DM
  request only produced a native Session answer; it is not counted as Channel delivery.
- **Browser navigation:** DM draft → Back → initially empty Group → Group draft → Back → DM
  restored only its own draft. List scroll was 900.5px both before opening Group and after Back.
  Horizontal overflow was zero. Exit removed the mobile shell/sidebar mark and restored native
  Plugins, New session and Settings. The Group send control stayed within the measured viewport.
- **Existing destinations:** Activity Center opens its existing view, and Bot Settings opens its
  existing dialog. Their data-loading states did not settle in the last observation; this is
  route reachability evidence only, not proof that every destination projection finished loading.
- **Locale/theme:** native dark appearance and native Chinese locale were inspected. This does
  not establish a complete light/dark platform matrix.

The initial full-suite run was **not green**: 481 files passed, 7 failed, 7 skipped; 4102 tests
passed, 13 failed, 13 skipped. Six task-related absent-window/bundle failures were fixed and
rerun in focused coverage. The other failures were outside this diff: dev-im-test-apps synthetic
stdin exit, source-policy timeout, bot-contact-discovery timeouts, channel-attachment-forwarding
timeout and channel-query timeout. A serial rerun of those five files passed 30 of 31 tests;
the dev-im-test-apps synthetic stdin exit failure remained. This does not turn the full suite green.

## Required Human QA / 人工验收

The mobile bottom bar is currently absent inside conversations to reserve composer space;
**this remains a candidate design, not a phone-validated conclusion**. The persistent Back and
list-header Exit controls are the intended escape routes. The existing Companion can overlap the bottom
area in these captures; its business logic is unchanged and needs a phone-level reachability
check before accepting this layout.

1. On a physical iPhone/Mobile Safari and Android browser, enter Bot mode and open both DM and
   Group from the list; send a message and observe the actual Channel response.
2. Open/close the software keyboard; verify composer, attachments, send, Back and Exit remain
   reachable (Exit is on the list header). Test nonzero top/bottom safe areas and browser chrome collapse/expansion.
3. Rotate portrait ↔ landscape, including with keyboard open, and check for horizontal overflow,
   clipped controls and correct desktop/mobile breakpoint restoration.
4. Scroll a long list, enter/return from a conversation and check position. Leave different
   unsent drafts in DM/Group; include reply, mention and attachment context. Drafts are ephemeral
   for this Client lifetime, not promised across page reload or Host restart.
5. Exercise all three bottom destinations, keyboard Tab/Enter/Space navigation, light/dark and
   English/Chinese. Check that destination data loads, and that Companion does not obstruct taps.
6. Exit Bot mode and inspect restored Host navigation/layout; repeat on desktop with messages
   fully loaded. Compare the current composer and menus; no #1432 dependency is required.

The environment reported device access disabled. Real keyboard, nonzero safe-area behavior,
native landscape interaction, Mobile Safari and physical-phone QA are **pending**, not passed.
The automated VisualViewport contraction test is a simulation, not native keyboard evidence.
Do not merge automatically; pause this PR for Human QA.
