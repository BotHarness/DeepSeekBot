# DeepSeekBot feature map

One file per user-facing feature. Each file has four sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-app`, and `Gotchas`.

| Feature                                                                                            | Needs a model              | Scripted journey                                                                                     | File                                                 |
| -------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Bot mode entry and the default DeepSeek Bot                                                        | no                         | `scripts/e2e-bot-mode-sidebar.mjs`                                                                   | [bot-mode.md](bot-mode.md)                           |
| Bot mode dock (desktop layout)                                                                     | no                         | none                                                                                                 | [bot-mode-dock.md](bot-mode-dock.md)                 |
| Bot DM reply                                                                                       | yes                        | `scripts/e2e-llm-scenarios.mjs --scenario dm-reply`                                                  | [bot-dm-reply.md](bot-dm-reply.md)                   |
| Bot-to-Bot Group mentions and wake                                                                 | yes                        | `scripts/e2e-llm-scenarios.mjs` (nightly)                                                            | [bot-group-mention.md](bot-group-mention.md)         |
| Conversation timeline: new-messages divider, kept place, folding, image preview, reactions, search | yes                        | none                                                                                                 | [conversation-timeline.md](conversation-timeline.md) |
| PersonaBot creation and restart persistence                                                        | for Bot-created Bots       | `scripts/e2e-personabot-create.mjs` (CI)                                                             | [personabot-create.md](personabot-create.md)         |
| Stop a working Bot (Web Client)                                                                    | yes                        | `scripts/e2e-web-stop.mjs`                                                                           | [bot-stop.md](bot-stop.md)                           |
| Phone pairing and paired devices                                                                   | no                         | `scripts/e2e-mobile-pairing-web.mjs`, `scripts/e2e-device-pairing.mjs`, `scripts/e2e-mobile-sim.mjs` | [phone-pairing.md](phone-pairing.md)                 |
| Phone notifications and paired computers (iOS Simulator)                                           | for the approval step      | `scripts/e2e-mobile-sim.mjs` (Mac)                                                                   | [phone-notifications.md](phone-notifications.md)     |
| Bot Browser on the phone                                                                           | no                         | `scripts/e2e-mobile-browser-web.mjs`                                                                 | [phone-browser.md](phone-browser.md)                 |
| Token usage on the phone                                                                           | yes                        | `scripts/e2e-mobile-usage-web.mjs`                                                                   | [phone-usage.md](phone-usage.md)                     |
| Routines on the phone                                                                              | no                         | `scripts/e2e-mobile-routines-web.mjs`                                                                | [phone-routines.md](phone-routines.md)               |
| Approval Templates, the Approval Reviewer and its self-escalation guard                            | for the reviewer and guard | none                                                                                                 | [approval-templates.md](approval-templates.md)       |
| Native activity rows and explicit menu navigation | no (existing QA records) | none (shared-device manual path) | [phone-activity.md](phone-activity.md) |
| About and running product identity | no (source-only observation; packaged/restart pending) | none (manual path) | [release-identity.md](release-identity.md) |
| Desktop Activity Center: one idle PersonaBot | no | `scripts/e2e-activity-idle.mjs` | [activity-center-idle.md](activity-center-idle.md) |

## Coverage and maintenance

The index routes verification; it is not a list of features proven on the current commit.
Some files contain manual paths or API-only journeys. Read each file's preconditions and
limits. Native journeys run only through the [shared device QA queue](../../../../docs/agents/device-qa.md).
After a failed drive use [observation](../references/observation.md) before retrying.

Run `node scripts/check-feature-map.mjs` for the current mapped/unmapped script inventory.
The check fails for a missing feature row, required section, local link or script, and when
an index row's scripted journeys disagree with its feature file. It runs in lint. Passing
checks only reference integrity: update and run the affected paths when the product changes.

| IM conversation mirroring and forwarding settings | no for settings; yes for a model-generated reply | `verify-app` settings path; real IM destination required for delivery | [im-conversation-mirroring.md](im-conversation-mirroring.md) |

## Not mapped yet

Legacy issue-era journeys often expect a prepared Host, fixed port or seeded fixture. Being
present under `scripts/` does not make a journey current or safe to run indiscriminately.
Prioritize gaps touched by the current PR; add a map entry after its path works against an
isolated instance, with the visible result and canonical read described.

Known gaps include standalone Activity Center/Inbox workflows, Workspace Grants, Memory
read/restore, desktop Browser/Computer lifecycle and IM connection/delivery. Some have partial
coverage inside other feature files and CLI commands, but no complete feature-map entry.
The unmapped inventory is a discovery list, not a claim that each script is broken.

Historical failures from 2026-10-14 (not requalified by this audit):

- `scripts/e2e-activity-entry.mjs` passed login, then timed out on `.bh-overview` behind onboarding.
- `scripts/e2e-harvest.mjs` needed a model reply and timed out without one.
