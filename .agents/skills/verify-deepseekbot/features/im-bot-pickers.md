# Live IM Bot pickers

## Sub-features

- IM app creation and binding offer only live, unpaused Bots.
- A deletion or pause while the picker is mounted removes the option and invalidates an already selected Bot.
- Existing bindings retain paused Bot names; deleted tombstones are not selectable.

## How to get to it (user POV)

Bot settings → IM apps → Create app, or Bind on an unbound connected app → Bot.

## Driving it with verify-app

1. Build the Client, launch a task-owned isolated Host and run `doctor`. Keep ARIA and console evidence for each attempt.
2. Require a qualified IM setup provider or an unbound connected app. Create two disposable Bots through the public owner. Delete one with retained Memory using `bot-delete-preview` / `bot-delete-confirm`; read `botharness/list` to confirm its historical `deleted` marker.
3. Open Create app and its Bot picker; require deleted/paused Bots to be absent and the live Bot present. Repeat Bind.
4. Select a disposable Bot, then delete or pause it while the picker remains open. Require its option to disappear and submission to be disabled. Retain browser evidence and the canonical deletion or pause result.
5. Confirm an existing app bound to a paused Bot retains that Bot's name, rather than its slug.

## Gotchas

- A stock isolated profile may return `apps: []` and `setups: []` from `botharness/messagingApps`. Create app is then intentionally unavailable: record the missing-provider runtime gap.
- Component regression tests reproduce the filtering and mounted-selection bug. The isolated Host confirms retained tombstones, but full Create/Bind UI evidence remains pending without a qualified provider/app.
- Historical roster rows are intentional. Filter picker eligibility before name equality comparison; do not remove tombstones from the canonical roster or change the shared comparator.
- These checks do not prove real IM delivery or native Desktop behavior. No model call is needed for picker assertions.
