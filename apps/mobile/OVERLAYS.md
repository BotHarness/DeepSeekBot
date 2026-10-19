# Mobile overlay standard

Target contract for new and changed mobile overlays. [中文](./OVERLAYS.zh.md). This supplements [DESIGN.md](./DESIGN.md); it does not certify that existing screens conform. Scope: sheets, full-screen modals, alerts/dialogs, action menus, popovers and the side drawer. Ordinary page, form and button design remains in DESIGN.md.

## Basis and terminology

Reviewed on 2026-10-18. Apple distinguishes presentation from modality: a sheet can be modal or nonmodal; a full-screen modal is not a bottom sheet. Apple recommends a grabber for resizable sheets, vertical dismissal, protection for unsaved content, and a clear task title. Its March 2026 guidance places single-step Cancel/Close on the leading side and Done on the trailing side, with an alternative to Done. These are platform guidance; the rules below are our product contract. Sources: [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [Modality](https://developer.apple.com/design/human-interface-guidelines/modality).

Android supports partially expanded sheets, dismissal callbacks and separate dialog/menu components. Our existing Material/OCAT visual choices remain product choices, rather than claims about mandatory Android styling. Sources: [bottom sheets](https://developer.android.com/develop/ui/compose/components/bottom-sheets-partial), [dialogs](https://developer.android.com/develop/ui/compose/components/dialog), [menus](https://developer.android.com/develop/ui/compose/components/menu).

“Drawer” alone is ambiguous. Name bottom sheets and the horizontal Host drawer separately. API names such as Expo Router `modal` and `formSheet` are implementation mechanisms, not UX categories.

## Choose by purpose

| Purpose                                                                                    | Presentation                                                         | Commit and dismissal                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect or change immediate preferences: Settings, Activity filters, notification switches | Bottom sheet with one internal navigation stack                      | Each control commits through its existing owner. Dismissal retains completed changes. No Save/Done footer.                                                     |
| Select one model or value                                                                  | Picker page within the existing sheet, or a short anchored menu      | A single choice commits once. Return after success when the picker is a separate page; keep multi-select surfaces open. Failure retains the selection context. |
| Create/edit a preset, routine or Host appearance                                           | Editor within the sheet; use full screen if the task needs the space | Draft until explicit Save/Create. Cancel discards only that draft. Back, swipe, backdrop and system Back use the same dirty-state guard.                       |
| Expanded message editor                                                                    | Full-screen editor                                                   | Closing returns the draft to the composer; only Send sends. Do not label draft transfer Save if nothing is persisted.                                          |
| Camera, Browser/Computer takeover, immersive media                                         | Full-screen modal                                                    | Explicit Close/Done action with task-specific meaning. No sheet grabber.                                                                                       |
| Confirm a consequential action or resolve an interruption                                  | Alert/dialog                                                         | Explicit named action, such as Unpair or Delete, and Cancel. No grabber or nested navigation.                                                                  |
| Reveal commands from an explicit More/Create trigger                                       | Anchored menu or platform action-menu adapter                        | Selecting runs the command or opens its flow. Outside tap/Back cancels; no Save/Done or sheet header.                                                          |
| Clarify the consequence of an action, including leaving a dirty editor                     | iOS action sheet / Android confirmation dialog                       | Explicit choices such as Keep Editing, Discard and Save where supported. Dismissal never performs the destructive action.                                      |
| Temporary contextual detail on a wide screen                                               | Anchored popover                                                     | Keep the anchor clear; adapt to a sheet in compact layouts.                                                                                                    |
| Switch computers                                                                           | Existing side Host drawer                                            | Header → scrollable Hosts → footer; horizontal dismissal, no bottom-sheet handle.                                                                              |

Alerts, action sheets and menus have different triggers; do not turn every short list into a confirmation dialog. See Apple's [alerts](https://developer.apple.com/design/human-interface-guidelines/alerts), [action sheets](https://developer.apple.com/design/human-interface-guidelines/action-sheets), [menus](https://developer.apple.com/design/human-interface-guidelines/menus) and [popovers](https://developer.apple.com/design/human-interface-guidelines/popovers). OS permissions, share sheets and system pickers retain their native presentation.

## Sheet anatomy

```text
One presentation owner
├─ Handle area — fixed, one actual drag affordance
├─ Header — fixed task/page title + only meaningful actions
├─ Body — the scrolling content, loading/error/empty states
└─ Optional action area — only when the task has explicit actions
```

- Bottom sheets in this product expose one handle above the header, including a single large-detent sheet when vertical dismissal is supported. This extends Apple's resizable-sheet recommendation; it is our consistency choice. Never add a decorative handle to a surface that cannot perform the indicated gesture.
- The native sheet owns its handle when available. A custom fallback must implement equivalent dismissal and accessibility, not merely paint a bar. Never show native and custom handles together. Native grabber tap-to-resize must not silently become destructive dismissal.
- Header, handle area and body use `theme.overlay.fill`; groups use `raised`. Use existing design tokens, platform touch targets and type roles. No per-screen radius, colour, handle or header-height constants.
- Keep one page title. The root uses a short noun/task name such as Settings or Filter and Sort. Child pages use their own title, such as Notifications; never expose route names such as `index`. Do not repeat the same title inside the body. A rich Bot identity/summary in the body is distinct from its compact navigation title.
- iOS uses the native navigation title/alignment where possible; Android uses the established leading-aligned Material header. Centre an iOS custom title in the available header geometry without allowing unequal actions to visually shift it. Long titles and accessibility text may grow/wrap in the shared header; essential actions never overlap or disappear. Keep the full accessible name even if a compact native title truncates.
- A sheet has one body scroll owner. Lists scroll to their top before a downward content drag collapses/dismisses the sheet. The handle remains reachable. The last row and actions clear bottom safe areas and the keyboard. Use the existing keyboard owner, never double-apply keyboard displacement or status-bar insets.
- Choose detents from the task: partial height for short contextual choices; large height for Settings, long model catalogs and forms. Maximum text size, landscape and keyboard presence can require large height. Do not hard-code a short viewport that traps content.

## Header and dismissal contract

| Mode                      | iOS header                                                                                                             | Android header / system Back                                                          | State after dismissal                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Immediate settings, root  | Task title; no trailing Down/Done/Save. Settings integrates Close into its accessible, tappable handle; no separate X. | Task title; shared accessible handle/Close affordance. Back dismisses.                | Completed changes remain.                         |
| Immediate settings, child | Leading Back + child title                                                                                             | Back/up + child title; system Back pops one level                                     | Changes remain; parent scroll/selection retained. |
| Editor, root              | Cancel + task title + Save/Create                                                                                      | Task title with explicit cancel/commit controls following the shared Material pattern | Only successful explicit commit saves.            |
| Editor, child             | Back + child title + applicable commit action                                                                          | Up/Back returns one level through the dirty guard                                     | No silent loss or implicit commit.                |
| Full-screen viewer        | Explicit Close or task-specific Done + title if useful                                                                 | Close/up with system Back equivalent                                                  | Defined per task; no assumed swipe-down exit.     |

Back never means close the entire sheet. Do not show Back, Cancel and Done together. Do not add a downward chevron simply because the view appeared from below. “Done” is reserved for finishing an actual task; it is not a universal synonym for Close.

Immediate settings do not create a transaction at dismissal. Local persistence or Host write failures remain visible and retryable through the existing state owner; an optimistic control must not imply a failed write is saved. Pending requests settle safely after navigation and cannot update a different Host or Bot. Do not change existing persistence boundaries to fit a new shell.

Swipe is a convenience, not the only operable exit. A full-height/long Settings sheet keeps a fixed, tappable handle exposed as a Close button with a platform-sized target and explicit accessibility activation/escape. The title-only root header omits a redundant X; child Back still pops one page. This is our immediate-settings contract, not a change to native resizable grabbers or transactional editors. Other sheets may omit a separate close button only when their native accessible dismissal and an operable non-drag alternative are verified. Implement accessibility escape/focus restoration; test VoiceOver/TalkBack, rather than inferring accessibility from a screenshot. Android Back dismisses the keyboard first where the native input owns it, then the child page, then the sheet. Predictive-back animation is a separate qualification.

For editors, intercept every exit path consistently. A dirty draft offers Keep Editing and Discard, plus Save only when the operation can complete validly. Failed saves retain input and errors. Pending destructive/commit requests reject duplicate submission; a late menu callback must not dismiss a newly opened confirmation. Do not block the user indefinitely if the operation fails.

One sheet owns one navigation stack. Push related pages inside it; do not stack another bottom sheet to edit the current one. A short confirmation may interrupt that stack. When a menu starts a different flow, dismiss the menu first and restore focus to the appropriate destination.

## Existing implementation audit

Survey: latest 70 PRs by creation order on 2026-10-18; eight relevant PR bodies/file lists inspected in detail. Published native results below are author-reported historical evidence, not new runs in this audit. “Merged” is from current GitHub metadata, not stale wording in PR bodies.

| PR                                                           | Reusable decision                                                      | State and limit                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [#2025](https://github.com/BotHarness/DeepSeekBot/pull/2025) | Fixed Android handle, nested content scroll, keyboard clearance        | Merged; Android evidence does not qualify iOS.                                                    |
| [#2031](https://github.com/BotHarness/DeepSeekBot/pull/2031) | Shared overlay fill and frame, responsive opening                      | Merged; Android rendering/gesture coverage.                                                       |
| [#2040](https://github.com/BotHarness/DeepSeekBot/pull/2040) | One SheetStack for Settings/Profile child pages                        | Merged; preserve this structure while repairing iOS.                                              |
| [#2073](https://github.com/BotHarness/DeepSeekBot/pull/2073) | Material settings, model editors, keyboard ownership                   | Merged; native dependency added; iOS qualification was still owed.                                |
| [#2078](https://github.com/BotHarness/DeepSeekBot/pull/2078) | Native-size-aware Android navigation and preferences                   | Merged; predictive back remains unqualified.                                                      |
| [#2007](https://github.com/BotHarness/DeepSeekBot/pull/2007) | Live system text size and reachable content/actions                    | Merged; retain its accessibility-size matrix.                                                     |
| [#1966](https://github.com/BotHarness/DeepSeekBot/pull/1966) | Activity filters commit immediately, no Cancel/Done                    | Merged; existing precedent for immediate settings.                                                |
| [#2109](https://github.com/BotHarness/DeepSeekBot/pull/2109) | Android themed dialog adapter, request identity, explicit confirmation | Open at audit time; coordinate with this PR, do not duplicate its adapter or assume it is merged. |

Source audit at PR #2112's base `2202bef4d` plus its Settings patch:

- `src/ui/primitives/sheet-screen.tsx` owns native form-sheet options and an Android handle; `sheet-stack.tsx` owns nested headers. Keep these as the shared integration points, not new per-screen wrappers.
- At the initial audit, `src/ui/settings-view.tsx` put its title and Done inside the scrolling body. #2112 moves the root title into the fixed navigation header, integrates accessible Close into the handle and removes Done.
- `src/ui/chat/sheet.tsx` always supplies a custom grabber and trailing Close for titled fallback modals. Its painted handle does not by itself prove drag support; classify each caller before migration.
- The initial #2112 iOS `modal` workaround rendered Settings without a handle: `sheetGrabberVisible` is applied by the pinned native library only for `formSheet`. Settings now opts into the shared frame handle within the native modal swipe region. Its gesture behavior, rather than the presence of a painted bar, is part of native acceptance.
- Model picker selections, model preset edits, routine edits and expanded message drafts have different commit boundaries. Keep them distinct when reusing the same header/frame.

## Delivery and acceptance

First slice: #2112 implements Settings root → Notifications → Back → Close/swipe, with one handle/header/body, immediate preferences and a fixed handle that supports tap, native drag, accessibility activation and escape. Native runtime results and remaining platform/accessibility/Human gates are recorded in its evidence report. Keep the PR unmerged until the Human authorizes it; this slice does not certify every overlay or platform.

Then adapt one representative immediate picker and one transactional editor through the shared primitives, before migrating remaining callers. Coordinate Android dialog work with #2109. No Host schema change, model-policy change, native dependency addition or wholesale redesign is implied by this standard.

For each changed family, record:

1. Exact JS/source and native build identity; same-device before/after screenshots. Separate iOS Simulator, physical iPhone and Android evidence.
2. English and Chinese titles; light/dark; default, intermediate and maximum accessibility text; live size changes and portrait/landscape. Missing CJK glyphs are an unresolved test limit, not a pass using English.
3. Open, content scrolling, final-row reachability, nested Back, close button, swipe, backdrop when supported, and Android Back. Confirm draft retention or discard by the declared mode; reopening/restarting verifies committed preferences.
4. Real soft keyboard with multiline fields and focus changes; validation, failed save/retry, pending action, duplicate tap, Host switch and late response.
5. Screen-reader title announcement, focus containment/return, a non-drag exit, Reduce Motion and actual handle semantics. Screenshots alone cannot pass these gates.

Source tests, CI bundles, native build success, runtime behavior and Human visual acceptance remain separate. Queue shared native verification; do not create a parallel Simulator or infer permission to merge.
