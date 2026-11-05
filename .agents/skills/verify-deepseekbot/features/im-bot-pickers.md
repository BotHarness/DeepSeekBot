# Live IM Bot pickers

## Sub-features

- IM app creation and binding offer only live, unpaused Bots.
- A deletion or pause while the picker is mounted removes the option and invalidates an already selected Bot.
- Existing bindings retain paused Bot names; deleted tombstones are not selectable.

## How to get to it (user POV)

Bot settings → IM apps → Create app, or Bind on an unbound connected app → Bot.

## Driving it with verify-app

1. Build the Client, launch a task-owned isolated Host and run `doctor`. Keep ARIA and console evidence for each attempt.
2. Give the isolated Profile a real IM setup provider: in a `dsh-im` checkout run `npm ci && npm run build`, then `DSH_HOME=<instance home> PATH=<repo>/node_modules/.bin:$PATH node bin/dsh-im.mjs install --profile web-dev --source .`. Stop the Host process (not `verify-app stop`, which deletes the home) and `launch` the same name again; `rpc botharness/messagingApps` must list `dsh-im/feishu` under `setups`. No IM credentials are needed to open Create app. Create two disposable Bots through the public owner. Delete one with retained Memory using `bot-delete-preview` / `bot-delete-confirm`; read `botharness/list` to confirm its historical `deleted` marker.
3. Open Create app and its Bot picker; require deleted/paused Bots to be absent and the live Bot present. Repeat Bind.
4. Select a disposable Bot, then delete or pause it while the picker remains open. Require its option to disappear and submission to be disabled. Retain browser evidence and the canonical deletion or pause result.
5. Confirm an existing app bound to a paused Bot retains that Bot's name, rather than its slug.

## Gotchas

- A stock isolated profile returns `apps: []` and `setups: []` from `botharness/messagingApps`, so Create app is hidden until `dsh-im` is installed as above.
- Bind needs an unbound connected app, which needs real IM credentials; the component regression test covers Bind and the mounted-deletion case.
- Historical roster rows are intentional. Filter picker eligibility before name equality comparison; do not remove tombstones from the canonical roster or change the shared comparator.
- These checks do not prove real IM delivery or native Desktop behavior. No model call is needed for picker assertions.
