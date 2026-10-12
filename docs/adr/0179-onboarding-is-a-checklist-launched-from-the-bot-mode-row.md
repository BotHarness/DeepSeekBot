---
Status: Accepted
Date: 2026-10-12
Issues: [#1496](https://github.com/BotHarness/DeepSeekBot/issues/1496)
---

# Onboarding is a getting-started checklist launched from a progress ring in the Bot-mode row

ADR-0155 replaced the persistent onboarding strip with a floating interface walkthrough that opens automatically once. Its only replay entry was Bot Settings → General. The walkthrough shows where things are but asks for nothing. It never reaches the experiences that make the plugin worth trying (Memory, IM binding, scheduled tasks), and it never explains how to enter or leave Bot mode. The audience is people trying the DeepSeekBot plugin, typically right after installing it on desktop or mobile. DSH's own onboarding belongs to the DSH team. We decided that **onboarding is a getting-started checklist whose launcher is a progress ring inside existing chrome. The checklist presents six experiences in tiers, each with a direct action, and each one's completion is read from that experience's own authority. The interface walkthrough becomes one action in the checklist.**

## Decision

- **Launcher without vertical cost.** On desktop, a progress ring sits inside the existing Bot-mode sidebar row, which already reserves room on its right for the Activity Center and the gear. The ring rests at the right edge and steps left when hover reveals those controls. On mobile, it sits beside the exit button in the list header. The ring stays visible until the checklist is settled, meaning every item is done or the tutorial was skipped. After that, it appears only when the row is hovered. Bot Settings → General stays as the fallback entry.
- **Checklist tiers.**
  - Required: choose a model, send the first message.
  - Recommended: let it remember you (Memory, the aha moment), connect a chat app, set a daily task.
  - Bonus: summon the Window Companion.

  Memory, chat app and daily task wait for the first real reply, which is when they have something to show.

- **Evidence, not a second store.**
  - Model readiness comes from the same catalog and plan check the send gate uses.
  - The first message comes from the receipt's completion evidence (ADR-0147).
  - Memory counts when a working change or a source-event accepted commit touches a path outside `.botharness/`. Profile-only commits do not count.
  - The chat app counts from messaging identities or grants.
  - The daily task counts from Bot schedules.
  - The companion counts from Window Companion presence.

  A failed read leaves only that item undone.

- **Actions reuse existing surfaces.**
  - Model opens the onboarding model dialog.
  - First message focuses the receipt DM's composer.
  - Memory and chat app open the welcome letter's existing optional dialogs (Memory opens directly on "remember a preference").
  - The daily task sends the letter's existing daily request as an ordinary Human message.
  - The companion selects the receipt Bot.
- **Receipt lifecycle unchanged.**
  - The first deliberate Bot-mode entry still performs `start`, but it now opens the checklist instead of the walkthrough.
  - Closing the checklist pauses. Skip uses `skip`. Opening from a paused receipt continues, and opening from a skipped one restarts.
  - Following an item's action keeps the tutorial active.
- **The walkthrough is an action.** "Show me around" starts the driver.js walkthrough. Its final step highlights the Bot-mode row (`data-bh-tour="bot-mode"`) and explains that clicking it again returns to DSH. Finishing it returns to the checklist.
- **Entering Bot mode.** Until Bot mode has been entered once in this browser, the inactive row shows a quiet "Try it" chip. This is a presentation preference only.

## Considered Options

- **Keep the auto walkthrough and only add a replay icon:** rejected. It still teaches layout without the actions that show value.
- **A separate header or banner row for progress:** rejected. It spends vertical space on every visit, which is the cost ADR-0155 removed.
- **Persist checklist progress in the receipt:** rejected. Each experience already has an authority. A copy would drift and would need its own migration.
- **Hide the launcher after completion:** rejected. Replay would then depend on finding the setting.

## Consequences

- ADR-0155's "first entry auto-starts the walkthrough" is amended: first entry auto-opens the checklist, and the walkthrough starts from it.
- Evidence reads run on entry, when the checklist opens, and every 20 seconds in Bot mode until the checklist is settled.
- The collapsed sidebar rail has no ring in this slice. Its entry is Bot Settings.
