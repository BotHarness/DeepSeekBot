---
Status: Accepted
Amended by: [ADR-0180](0180-onboarding-is-a-checklist-launched-from-the-bot-mode-row.md) — first entry opens a getting-started checklist from a progress ring in the Bot-mode row; the walkthrough starts from it.
Date: 2026-10-09
Issues: [#1295](https://github.com/BotHarness/BotHarness/issues/1295), [#1301](https://github.com/BotHarness/BotHarness/issues/1301)
---

# Onboarding tutorial is a floating interface walkthrough, auto-presented once and replayed from Bot Settings

The tutorial surface used to be a permanent strip at the top of the Bot-mode content area: `OnboardingSurface` rendered the preparing state, goal, Start/Skip/Continue/Restart controls and the unsent-question entry as the first child of the Bot panel, above every view. It never went away — after completion it kept a full-width row showing "First conversation completed" and Restart. It was the only replay entry, and it spent a whole header row of vertical space in every Bot-mode visit, including for Profiles that finished onboarding months earlier. The first slice replaced it with a floating driver.js highlight of the welcome card, but that still repeated the first-conversation guidance, which belongs to the Bot conversation itself. We decided that **the tutorial is a multi-step driver.js walkthrough of the interface — starting from the welcome letter and then showing where the conversation list, Activity Center, Bot settings, conversation header, message box, Channel sidebar and Window Companion are — started automatically once per Profile, with Continue/Restart moved into Bot Settings → General; no persistent strip remains, and the welcome message itself is presented as a letter from the PersonaBot.**

## Decision

- **No persistent surface.** The Bot panel keeps only a headless lifecycle component (`OnboardingOverlay`): preparation, refresh and the 5-second reconciliation poll are unchanged, and it still renders the model and send-review modals. It no longer renders the strip, so a completed or skipped Profile sees no onboarding chrome at all.
- **The tour walks the interface.** Steps are declared as selector/title/description specs: the welcome letter (`data-onboarding-welcome`) first — the conversation starts there — then the roster (`data-bh-tour="roster"`), the Activity Center entry (`inbox`), the Bot settings gear (`bot-settings`), the conversation header (`topbar`), the message box (`composer`), the Channel sidebar (`channel-sidebar`) and the Window Companion (`companion`). Anchors that are absent (a hidden sidebar, no companion) are skipped, and the engine waits briefly for the first anchor before starting. Explicit `data-bh-tour` attributes are the contract, not incidental class names.
- **First entry auto-starts.** On the first deliberate Bot-mode entry, once the receipt is `not-started` and incomplete, the Client performs the existing `start` transition, navigates to the receipt's DM and opens the walkthrough; the host persists `active` as before. The popover footer carries **Skip tutorial** (the existing `skip` transition), Previous/Next/Done and a progress indicator; closing or Escape pauses.
- **Dialogs end the presentation.** A real (non-driver) dialog appearing during the tour pauses it instead of being covered, and model or send-review configuration destroys it as before. Driver.js remains temporary presentation only.
- **Replay lives in Bot Settings.** Bot Settings → General has one "Onboarding tutorial" row: Start while the receipt is unknown or not started, Continue while active or paused, Restart when skipped or completed. Activating it closes Bot Settings, opens the receipt's DM through the existing navigation, and performs the chosen tutorial transition. Restart keeps identity, credentials, conversations, completion and companion preferences exactly as ADR-0147 requires.
- **The welcome message is a letter.** The product-authored system welcome keeps its provenance (a "preset welcome letter · provided by the product" footnote) but renders as a profile-style card — seeded banner, the Bot's avatar over its lower edge, name and tags — with first-person letter copy and the suggestion questions kept as reply options. The timeline labels that message with the Bot's name instead of "System".
- **Edge entries move into existing surfaces.** A failed preparation or refresh shows a floating notice with the existing retry action instead of a strip row; the retained unsent question is offered inside the welcome letter; choosing among existing PersonaBots stays in the roster. "Preparing" no longer renders its own chrome.

## Considered Options

- **Keep the strip but hide it after completion:** rejected. It still spends a header row for every unfinished or paused Profile, and hiding the only replay control makes completion a dead end.
- **Keep the tour as a single welcome-card highlight:** rejected. The first-conversation guidance already lives in the conversation and its letter; a highlight that repeats it teaches nothing about the rest of the interface.
- **A floating pill for resume after pause:** rejected. ADR-0147 keeps paused and skipped states quiet on re-entry; replay belongs in settings, not a second piece of ambient chrome.
- **Auto-present without persisting `active`:** rejected. Closing the tour would not pause the shared receipt, so every later entry would pop the tour again.
- **Keep the strip as the replay entry and remove only the completed state:** rejected. It keeps the vertical cost and splits the replay entry from every other BotHarness setting.

## Consequences

- ADR-0147's surface sentence "Explicit Start/Continue/Restart controls it" is amended: Start is implicit on the first Bot-mode entry and still persisted; closing pauses; explicit Continue/Restart (and Start for an unknown receipt) live in Bot Settings. The receipt schema, completion evidence and tutorial states are unchanged.
- The auto-start navigates to the receipt's DM, so the welcome-letter step is normally present; a Profile whose DM never opens still starts the walkthrough on first entry and skips the missing step.
- Other Clients observing an `active` tutorial still do not reopen highlights by themselves; they can Continue or Restart from Bot Settings.
- `OnboardingSurface` disappears from the Client; the strip's "preparing", "goal" and "completed" strings are removed from the locale.
- The welcome letter's copy uses user-facing language ("personal Bot"), not the internal PersonaBot term, per the locale term gate.
