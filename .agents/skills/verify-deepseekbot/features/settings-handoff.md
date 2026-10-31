# Native settings handoff and IM Bot pickers

## Sub-features

- Model setup opens native Models, not the mobile app dialog, from welcome step 3, Home model configuration and a model-failure action.
- Native Settings temporarily reveals its own sidebar controls without changing the Bot main view. Closing Settings restores Bot navigation; cancellation and timeout also release the handoff.
- IM app creation and binding offer only live, unpaused Bots. A deletion arriving while the picker is mounted removes the option and invalidates an already selected Bot without losing other app names.

## How to get to it (user POV)

- First-run welcome: Bot mode → welcome step 3 (Models) → Open model settings.
- Home with an unusable model: configure the model → Open model settings. A model failure card has the same action.
- Bot settings → IM apps → Create app, or Bind on an unbound connected app → Bot.

## Driving it with verify-app

1. Build the Client, launch a task-owned isolated Host and run `doctor`. Keep ARIA and console evidence for each attempt.
2. On a fresh Chinese welcome flow, run `node scripts/verify-app.mjs shot models --name <n> --bot-mode --locale zh --click '3 模型' --click '打开模型设置 管理服务商、Key 和可用模型。' --wait '添加模型提供商'`. Require native `dialog "设置"`, heading `模型` and the Add model provider action. The welcome model label alone is not proof. Confirm no mobile app popup is shown. Read the current ARIA snapshot if the entry's hint changes.
3. Repeat the entry actions, then click native Close and wait for Exit Bot mode. Require the Bot main view and welcome model step to return. Repeat the Home and failure-card entry points when their preconditions are available; keep those results separate from first-run proof.
4. For IM, the Host must advertise a qualified setup provider or an unbound connected app. Create two disposable Bots through the public owner, delete one with retained Memory using `bot-delete-preview` / `bot-delete-confirm`, and read `botharness/list` to confirm its historical `deleted` marker.
5. Open Create app and its Bot picker; require the deleted/paused Bots to be absent and the live Bot present. Repeat Bind. With a selected disposable Bot, delete it while the picker remains open; require its option to disappear and submission to be disabled. Retain browser evidence and the canonical deletion result.

## Gotchas

- A generic dialog trigger may be Get mobile app. RC2's native Settings entry is also available through Account menu; its visible keycaps are `aria-hidden` and must not change its accessible name.
- The welcome dialog itself contains Models. Waiting for that label can incorrectly pass with the original bug still present; wait for Add model provider inside native Settings.
- A stock isolated profile may return `apps: []` and `setups: []` from `botharness/messagingApps`. In that case Create app is intentionally unavailable: report the missing-provider runtime gap rather than treating component fixtures as end-to-end proof.
- Complete the welcome opening and closing checks before creating or deleting fixture Bots. Historical roster changes can advance the welcome into the layout tutorial, so replaying step 3 afterward no longer tests the same precondition.
- These paths do not prove real IM delivery, a saved provider credential, model usability or native Desktop behavior. No model call is needed for the navigation assertions.
