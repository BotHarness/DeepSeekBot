# DeepSeekBot feature map

| Feature | Needs a model | Scripted journey | File |
| --- | --- | --- | --- |
| VRM companion Panel | yes for speaking | `scripts/e2e-vrm-companion.mjs` | [vrm-companion.md](vrm-companion.md) |
| Desktop whole-window zoom (controlled S1 / Windows candidate) | no | `scripts/e2e-desktop-zoom-launch.mjs`, `scripts/e2e-desktop-zoom-windows.mjs`, `scripts/e2e-dock-zoom.mjs`, `scripts/e2e-workspace-chrome.mjs` | [desktop-window-zoom.md](desktop-window-zoom.md) |
| Global search: Alt/Option+K, settings results and pinyin matching | no | `verify-app` Bot mode path | [global-search.md](global-search.md) |
| DeepSeekBot device-local appearance | no | `scripts/e2e-local-appearance.mjs` | [local-appearance.md](local-appearance.md) |
| Functional Panel appearance | no | `scripts/e2e-panel-appearance.mjs`, `scripts/e2e-nested-appearance.mjs` | [panel-appearance.md](panel-appearance.md) |
| Global panel materials | no | `scripts/e2e-global-materials.mjs` | [global-materials.md](global-materials.md) |
| Home and protected Tob (Bot management, models, runtime, privacy and updates) | yes for reply and approval | `scripts/e2e-tob-home.mjs`, `scripts/e2e-tob-model-runtime.mjs`, `scripts/e2e-tob-bot-management.mjs`, `scripts/e2e-tob-channel-management.mjs`, `scripts/e2e-tob-group-settings.mjs`, `scripts/e2e-tob-group-decisions.mjs` | [tob-home.md](tob-home.md) |
| DSH Session list Bot folders | for fresh execution | `scripts/e2e-bot-session-folders.mjs` | [bot-session-folders.md](bot-session-folders.md) |

One file per user-facing feature. Each file has four sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-app`, and `Gotchas`.

| Feature                                                                                            | Needs a model              | Scripted journey                                                                                     | File                                                 |
| -------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Bot mode entry and the default DeepSeek Bot                                                        | no                         | `scripts/e2e-bot-mode-sidebar.mjs`, `scripts/e2e-panel-workspace.mjs`, `scripts/e2e-bot-mode-exit.mjs`                                                                   | [bot-mode.md](bot-mode.md)                           |
| Bot mode dock (desktop layout, unified Sessions, Channel header, Profile, settings, files and Inbox) | no | `scripts/e2e-panel-workspace.mjs`, `scripts/e2e-channel-sessions.mjs`, `scripts/e2e-bot-subpanels.mjs`, `scripts/e2e-browser-computer-subpanels.mjs`, `scripts/e2e-panel-size-persistence.mjs`, `scripts/e2e-panel-resize-stability.mjs`, `scripts/e2e-nested-channel-panels.mjs`, `scripts/e2e-channel-sessions-desktop.mjs`, `scripts/e2e-bot-mode-sidebar.mjs` | [bot-mode-dock.md](bot-mode-dock.md) |
| Orchestrator model switching | yes, for reply evidence | none | [orchestrator-model-switch.md](orchestrator-model-switch.md) |
| Private input with mixed local/IM sources | yes, for native tool/approval proof | `scripts/e2e-private-input-origin.mjs` | [private-input-origin.md](private-input-origin.md) |
| Bot DM reply                                                                                       | yes                        | `scripts/e2e-llm-scenarios.mjs --scenario dm-reply`                                                  | [bot-dm-reply.md](bot-dm-reply.md)                   |
| Bot-to-Bot Group mentions and wake                                                                 | yes                        | `scripts/e2e-llm-scenarios.mjs` (nightly)                                                            | [bot-group-mention.md](bot-group-mention.md)         |
| Group send review | yes for A/B; no for direct tools | `scripts/e2e-group-send-review.mjs`, `scripts/e2e-group-peer-review.mjs`, `scripts/e2e-group-busy-review.mjs`, `scripts/e2e-group-responsibility.mjs` | [group-send-review.md](group-send-review.md) |
| Conversation timeline: new-messages divider, kept place, folding, image preview, reactions, search, member mention | for replies | none | [conversation-timeline.md](conversation-timeline.md) |
| PersonaBot creation and restart persistence                                                        | for Bot-created Bots       | `scripts/e2e-personabot-create.mjs` (CI)                                                             | [personabot-create.md](personabot-create.md)         |
| Stop a working Bot (Web Client)                                                                    | yes                        | `scripts/e2e-web-stop.mjs`                                                                           | [bot-stop.md](bot-stop.md)                           |
| Phone pairing and paired devices                                                                   | no                         | `scripts/e2e-mobile-pairing-web.mjs`, `scripts/e2e-device-pairing.mjs`, `scripts/e2e-mobile-sim.mjs`, `scripts/e2e-mobile-pair-android.mjs` | [phone-pairing.md](phone-pairing.md)                 |
| Native mobile chat backgrounds | no (except live-reply regression) | none (shared-device native path) | [phone-chat-backgrounds.md](phone-chat-backgrounds.md) |
| Android sheets, shell and chat presentation | no | `scripts/e2e-mobile-android-interactions.mjs` | [phone-android-interactions.md](phone-android-interactions.md) |
| Phone notifications and paired computers (iOS Simulator)                                           | for the approval step      | `scripts/e2e-mobile-sim.mjs` (Mac)                                                                   | [phone-notifications.md](phone-notifications.md)     |
| Bot Browser on the phone                                                                           | no                         | `scripts/e2e-mobile-browser-web.mjs`                                                                 | [phone-browser.md](phone-browser.md)                 |
| Token usage on the phone                                                                           | yes                        | `scripts/e2e-mobile-usage-web.mjs`                                                                   | [phone-usage.md](phone-usage.md)                     |
| Routines on the phone                                                                              | no                         | `scripts/e2e-mobile-routines-web.mjs`                                                                | [phone-routines.md](phone-routines.md)               |
| Approval Templates, the Approval Reviewer and its self-escalation guard                            | for the reviewer and guard | none                                                                                                 | [approval-templates.md](approval-templates.md)       |
| Native activity rows, explicit menu navigation and swipe triage | no for rows; yes for the swipe web journey | `scripts/e2e-mobile-activity-swipe-web.mjs` (web preview; native rows stay a shared-device manual path) | [phone-activity.md](phone-activity.md) |
| Clear all BotHarness data (preview, second confirmation, restart removal) | no | none (disposable Host only) | [data-reset.md](data-reset.md) |
| About and running product identity | no (source-only observation; packaged/restart pending) | none (manual path) | [release-identity.md](release-identity.md) |
| Historical Overview: idle PersonaBot (retired by #2026) | no | `scripts/e2e-activity-idle.mjs` | [activity-center-idle.md](activity-center-idle.md) |
| Temporary Workspace Grant authorization, read and revocation | no | `scripts/e2e-workspace-grant.mjs` | [workspace-grant.md](workspace-grant.md) |
| Default Bot Browser open, observe, stop and Access refusal | no | `scripts/e2e-browser-lifecycle.mjs` | [browser-lifecycle.md](browser-lifecycle.md) |
| Composer footer customization and optional reply speed | yes for a speed sample | none (Web interaction path) | [composer-footer.md](composer-footer.md) |
| Disposable Memory history, restore and stale-head refusal | no | `scripts/e2e-memory-restore.mjs` | [memory-restore.md](memory-restore.md) |
| Version-bound Memory images, Markdown previews and CLI export | no | `scripts/e2e-memory-images.mjs`, `scripts/e2e-memory-markdown.mjs`, `scripts/e2e-memory-formats.mjs` | [memory-images.md](memory-images.md) |

| Activity Center: approvals, Channel mute and independent control-rail indicator; page and Dock | yes (real pending requests) | `scripts/e2e-inbox-tool-approval.mjs`, `scripts/e2e-activity-live.mjs`, `scripts/e2e-activity-approve-sync.mjs`, `scripts/e2e-activity-load.mjs` | [activity-inline-approval.md](activity-inline-approval.md) |

## Coverage and maintenance

| IM DM commands, current authority and canonical reply outcomes | no for commands; yes for ordinary follow-up | none (isolated Host, CLI and authorized native IM path) | [im-dm-commands.md](im-dm-commands.md) |

The index routes verification; it is not a list of features proven on the current commit.
Some files contain manual paths or API-only journeys. Read each file's preconditions and
limits. Native journeys run only through the [shared device QA queue](../../../../docs/agents/device-qa.md).
After a failed drive use [observation](../references/observation.md) before retrying.

Run `node scripts/verification-report.mjs` for the complete behavior/script inventory and
selected runtime evidence. See the [coverage report guide](../../../../docs/agents/verification-inventory.md)
for metrics, evidence selection and contributor requirements.

Run `node scripts/check-feature-map.mjs` for reference and inventory integrity.
The check fails for a missing feature row, required section, local link or script, and when
an index row's scripted journeys disagree with its feature file. It runs in lint. Passing
checks only reference integrity: update and run the affected paths when the product changes.

| Cloud Agent Host connections | yes for Agent response; no for credential management | isolated Host plus real TOB UAT, two Hosts for collaboration | [cloud-host-connections.md](cloud-host-connections.md) |
| IM conversation mirroring and forwarding settings | no for settings; yes for a model-generated reply | `verify-app` settings path; real IM destination required for delivery | [im-conversation-mirroring.md](im-conversation-mirroring.md) |
| Memory working and commit diffs | no | `scripts/e2e-memory-diff-wrap.mjs` | [memory-diffs.md](memory-diffs.md) |

## Not mapped yet

Legacy issue-era journeys often expect a prepared Host, fixed port or seeded fixture. Being
present under `scripts/` does not make a journey current or safe to run indiscriminately.
Prioritize gaps touched by the current PR; add a map entry after its path works against an
isolated instance, with the visible result and canonical read described.

Known gaps include standalone Activity Center/Inbox workflows, broader Memory recovery,
desktop Browser/Computer lifecycle and IM connection/delivery. Some have partial
coverage inside other feature files and CLI commands, but no complete feature-map entry.
The unmapped inventory is a discovery list, not a claim that each script is broken.

Historical failures from 2026-10-14 (not requalified by this audit):

- `scripts/e2e-activity-entry.mjs` passed login, then timed out on `.bh-overview` behind onboarding.
- `scripts/e2e-harvest.mjs` needed a model reply and timed out without one.

| Image wallpaper | no | `scripts/e2e-image-wallpaper.mjs` | [image-wallpaper.md](image-wallpaper.md) |

| Video wallpaper | no | `scripts/e2e-video-wallpaper.mjs` | [video-wallpaper.md](video-wallpaper.md) |

| Appearance recovery | no | `scripts/e2e-appearance-recovery.mjs`, `scripts/e2e-message-history-mask.mjs` | [appearance-recovery.md](appearance-recovery.md) |

| Three-action tool approval and coherent Full Access | yes | `scripts/e2e-tool-approval-simple.mjs` | [tool-approval-simple.md](tool-approval-simple.md) |
| Workspace request read/write approval and original-task continuation | yes | `scripts/e2e-workspace-request-write.mjs`, `scripts/e2e-mobile-folder-browse-web.mjs` | [workspace-request-write.md](workspace-request-write.md) |
