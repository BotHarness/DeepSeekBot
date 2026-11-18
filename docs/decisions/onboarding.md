# Onboarding and layout decisions

How a new Human's first run is recorded and guided, and how the desktop Bot-mode layout behaves in Simple and Advanced. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md); Tob itself is in [Tob decisions](tob.md); model ownership is in [Session decisions](sessions.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0147, 0155, 0180, 0233, 0259 and 0269, and each section lists the ADRs it absorbed.

Two rules run through every section:

- **Progress is read from each experience's own owner, never copied.** The Host keeps one onboarding receipt per Profile with the tutorial lifecycle and the result references it needs. Completion, a created Bot or group, a model, Memory or a schedule is read from the owner that already records it, so a missed notification or a restart can always be reconciled.
- **Onboarding never acts for the Human.** Suggestions fill a draft; no refresh, restoration, replay or other Client submits a message, approves a change or re-executes a creation.

## 1. Onboarding is one Profile receipt; completion is canonical DM evidence

<a id="adr-0147"></a>
_Formerly ADR-0147; its welcome message was removed by ADR-0233 (§2), and its Start, Continue and Restart controls moved to Bot Settings by ADR-0155 (§3)._

An application-defined Onboarding owner keeps one receipt per Profile in the operational database (`bot_onboarding`). It starts only on a deliberate Bot-mode entry and records a stable intended identity before the existing Registry and Memory lifecycle prepares it: Tob on a Host that has one, otherwise one default Bot with the website mascot Appearance. Existing Bots are reused or selected, and an archived or deleted identity is never restored. The Channel owner prepares the real Human DM. No synthetic reply and no second message store exist.

The first conversation is complete when that DM's Bot wrote a nonempty reply to a Human request in the same DM. The Channel append records the trusted Session owner and the request's Source Event beside the output, and the owner reconciles that evidence after notifications, refreshes and restarts. Acceptance, failures, approval requests, Bot questions and other notices do not count.

The tutorial lifecycle (not started, active, paused, skipped) is separate from completion. Restart keeps identity, model settings, conversations, completion and companion preferences. Unsent text stays in Client session storage and never sends on restore; once the normal Human message id is allocated, a lost response reconciles that message instead of offering the draft again. Saving a model and sending a question are separate Human actions, and "Retry this message" replays the original message through Inbox Admission under the existing side-effect fences. Native model and credential Services stay the only authorities; the Profile-default option saves through the native default-model Service and verifies the read-back.

Why: refresh, several Clients and interrupted preparation must not create competing Bots or count a welcome card as a conversation. Evidence that can be recomputed survives a missed callback; a stored "done" flag would not.

Enforced by: `packages/core/test/onboarding.test.ts` (concurrent entry prepares one Bot, Appearance and Memory without welcome messages; skip and pause stay independent of completion, which survives a Host restart; manual retry is refused after a side effect; default-model saves check revisions).

## 2. The desktop journey: an intro once, then the layout tour

<a id="adr-0233"></a>
_Formerly ADR-0233, with its step 4 and 5 amendments from ADR-0259 and [ADR-0268](tob.md#adr-0268)._

On desktop a receipt carries a journey (version 2). The first Bot-mode entry opens an intro dialog once per Profile: welcome, theme, model, phone, community, and a start step that begins from a persona template, an interview or the Human's own Bot. The Human's dismissal is a Host acknowledgement, so another Client does not reopen it. After the intro the journey reveals the Tob DM and teaches the panel controls of the chosen Layout mode (§4) as a driver.js tour; finishing or closing the tour finishes the journey. Restart clears the device-local tour flag and opens the intro again. `tobs onboarding [--action …]` reads and changes the lifecycle with the same Host checks as the Client; it is Human administration, not a Tob capability.

Bots and groups that Tob creates during the journey are taken only from committed creation receipts. The scoped Shell adapter records the operation correlation before an already approved creation runs, and the owner reconciles committed Bot and Channel operation receipts on refresh. A group counts only once the Bot is actually a member. Model prose and rejected or reserved operations never advance the journey, a removed unfinished target can be replaced, and onboarding never re-executes a creation.

A receipt from before the journey keeps its outcome: completed or skipped stays settled, and any other state becomes paused until the Human reopens it. New Bots and Tob get no default welcome message; existing welcome records still render.

Why: a model reply does not prove that a Bot or group exists, and the five-step guide of ADR-0233 asked the Human for work that the intro and Tob conversation now cover. The step 5 action of ADR-0233 (click Home's title, later select Messages on the rail) went away with Home ([ADR-0268](tob.md#adr-0268)); the shipped journey ends with the layout tour.

Enforced by: `packages/core/test/onboarding.test.ts` (only successful new scoped creations are recorded and kept through pause, replay and restart; committed operations are recovered after a missed callback and wait for real membership; the earliest replacement wins deterministically), `packages/client/test/onboarding-layout-tour.test.tsx`, `packages/client/test/onboarding.test.ts`.

## 3. Replay lives in Bot Settings; the checklist only serves receipts without a journey

<a id="adr-0155"></a>
<a id="adr-0180"></a>
_Formerly ADR-0155 and ADR-0180; their auto-started tour and checklist were replaced on desktop by the journey (§2)._

No onboarding strip or banner takes vertical space. Bot Settings → General has one "Onboarding tutorial" row: Start while the receipt is unknown or not started, Continue while active or paused, Restart when skipped or done. Activating it closes Bot Settings and performs that lifecycle action.

A Host that reports no journey still gets the getting-started checklist, opened from a progress ring in the Bot-mode row on desktop or beside the exit button on mobile. Its items are a model, the first message, seeing the Bot's session in DSH, Memory, a chat app, a daily task and the Window Companion; the items after the first message stay locked until a real reply exists. Each item reads its own owner (the send gate's model check, the receipt's completion, a commit outside `.botharness/`, messaging identities or grants, Bot schedules, Window Companion presence), and a failed read leaves only that item undone. "Show me around" starts the interface walkthrough over explicit `data-bh-tour` anchors, skipping any that are absent. The "Try it" chip and the DSH-session tour are browser-local presentation facts, not receipt state.

Why: a permanent strip cost a header row on every visit, even months after onboarding. Copying checklist progress into the receipt would drift from the owners and need its own migration.

Enforced by: `packages/client/test/onboarding-checklist.test.ts`, `onboarding-settings.test.ts`, `onboarding-overlay.test.ts`, `onboarding-memory.test.ts`, `onboarding-binding.test.ts`.

## 4. Desktop Layout mode: Simple keeps Messages, Advanced docks freely

<a id="adr-0259"></a>
<a id="adr-0269"></a>
_Formerly ADR-0259 and ADR-0269; ADR-0269 replaced ADR-0259's full-height Simple view switching, and [ADR-0268](tob.md#adr-0268) removed Home._

Layout mode is a device-local choice owned by the Client layout owner, with no Host route or CLI command. A saved choice wins; otherwise a Human with a saved Advanced layout starts in Advanced and a new Human in Simple. Each mode keeps its own arrangement and switching never rewrites the other; Reset resets only the current mode. The mode is chosen in Bot Settings → Appearance and during the intro.

- **Simple.** Messages is always shown. Between the Workspace Control Rail and Messages sits an optional Side column with one Global panel: the Channel list (first, and the default), Activity Center, Marketplace or a plugin Global panel. Selecting a switch shows its panel there, hiding (not unmounting) the previous one; selecting the shown switch hides the column. Messages and Tob have no rail switch, the rail cannot be moved, and opening a Channel from elsewhere changes only Messages. One Side column width (at most 60%) and the shown panel persist; a saved Messages or Home view migrates to the Channel list. The Messages header toggles the Subpanel column, which stacks the active Channel's subpanels with resizable heights and keeps them running when collapsed.
- **Advanced.** The free two-level workspace. A panel with no remembered position opens as a new column (Messages right of the Channel list, Activity Center right of Messages, plugin `right` panels rightmost), and saved layouts are never moved.

Why: a new Human did not know where a new panel would open, and full-view switching hid the conversation whenever Activity Center or Marketplace opened. Freedom and predictability are hard to give in one layout, so each mode gets its own. ADR-0259 fixed the Subpanel order; the shipped column lets the Human drag or Alt+Arrow entries and persists the order.

Enforced by: `packages/client/test/layout-mode.property.test.ts` (for any saved record, a saved choice wins and otherwise a saved Advanced layout starts Advanced; reading and saving never touch the Advanced arrangement; a Messages or Home view never lands in the Side column; the record reads back exactly and stays at most 60% wide), `layout-mode.test.ts`, `simple-side-column.test.tsx`.
