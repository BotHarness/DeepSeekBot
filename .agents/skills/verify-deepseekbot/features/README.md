# DeepSeekBot feature map

One file per user-facing feature. Each file has four sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-app`, and `Gotchas`.

| Feature                                                                                            | Needs a model              | Scripted journey                                                       | File                                                 |
| -------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| Bot mode entry and the default DeepSeek Bot                                                        | no                         | none                                                                   | [bot-mode.md](bot-mode.md)                           |
| Bot mode dock (desktop layout)                                                                     | no                         | none                                                                   | [bot-mode-dock.md](bot-mode-dock.md)                 |
| Bot DM reply                                                                                       | yes                        | `scripts/e2e-llm-scenarios.mjs --scenario dm-reply`                    | [bot-dm-reply.md](bot-dm-reply.md)                   |
| Bot-to-Bot Group mentions and wake                                                                 | yes                        | `scripts/e2e-llm-scenarios.mjs` (nightly)                              | [bot-group-mention.md](bot-group-mention.md)         |
| Conversation timeline: new-messages divider, kept place, folding, image preview, reactions, search | yes                        | none                                                                   | [conversation-timeline.md](conversation-timeline.md) |
| PersonaBot creation and restart persistence                                                        | no                         | `scripts/e2e-personabot-create.mjs` (CI)                               | [personabot-create.md](personabot-create.md)         |
| Stop a working Bot (Web Client)                                                                    | yes                        | `scripts/e2e-web-stop.mjs`                                             | [bot-stop.md](bot-stop.md)                           |
| Phone pairing and paired devices                                                                   | no                         | `scripts/e2e-mobile-pairing-web.mjs`, `scripts/e2e-device-pairing.mjs` | [phone-pairing.md](phone-pairing.md)                 |
| Phone notifications and paired computers (iOS Simulator)                                           | for the approval step      | `scripts/e2e-mobile-sim.mjs` (Mac)                                     | [phone-notifications.md](phone-notifications.md)     |
| Bot Browser on the phone                                                                           | no                         | `scripts/e2e-mobile-browser-web.mjs`                                   | [phone-browser.md](phone-browser.md)                 |
| Token usage on the phone                                                                           | yes                        | `scripts/e2e-mobile-usage-web.mjs`                                     | [phone-usage.md](phone-usage.md)                     |
| Routines on the phone                                                                              | no                         | `scripts/e2e-mobile-routines-web.mjs`                                  | [phone-routines.md](phone-routines.md)               |
| Approval Templates, the Approval Reviewer and its self-escalation guard                            | for the reviewer and guard | none                                                                   | [approval-templates.md](approval-templates.md)       |

| IM conversation mirroring and forwarding settings | no for settings; yes for a model-generated reply | `verify-app` settings path; real IM destination required for delivery | [im-conversation-mirroring.md](im-conversation-mirroring.md) |

## Not mapped yet

Native activity layout and explicit menu navigation: [phone-activity.md](phone-activity.md).
The shared-Simulator manual path uses existing QA records; it is not a fresh-Host scripted journey.

`scripts/` holds 119 issue-era `e2e-*.mjs` journeys. Most expect a hand-prepared Host, a specific port or seeded fixture. Journeys whose selectors, menu items or schema assertions no longer exist in the current code were deleted on 2026-10-14; the PR evidence pages under `docs/assets/pr/` still name them as history. Map a feature here only after its journey passes against a fresh instance. Known state on 2026-10-14:

- `e2e-activity-entry.mjs` passes login, then times out on `.bh-overview` behind the onboarding dialog.
- `e2e-harvest.mjs` needs a model reply and timed out without one.
