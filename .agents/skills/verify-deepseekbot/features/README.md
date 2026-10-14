# DeepSeekBot feature map

One file per user-facing feature. Each file has four sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-app`, and `Gotchas`.

| Feature | Needs a model | Scripted journey | File |
| --- | --- | --- | --- |
| Bot mode entry and the default DeepSeek Bot | no | none | [bot-mode.md](bot-mode.md) |
| Bot DM reply | yes | none | [bot-dm-reply.md](bot-dm-reply.md) |
| PersonaBot creation and restart persistence | no | `scripts/e2e-personabot-create.mjs` (CI) | [personabot-create.md](personabot-create.md) |

## Not mapped yet

`scripts/` holds about 150 issue-era `e2e-*.mjs` journeys. Most expect a hand-prepared Host, a specific port or seeded fixture, and some target UI that has changed since. Map a feature here only after its journey passes against a fresh instance. Known state on 2026-10-14:

- `e2e-activity-entry.mjs` passes login, then times out on `.bh-overview` behind the onboarding dialog.
- `e2e-memory-file-actions.mjs` reads `BH_E2E_INSTANCE` but times out in its first button click.
- `e2e-harvest.mjs` needs a model reply and timed out without one.
