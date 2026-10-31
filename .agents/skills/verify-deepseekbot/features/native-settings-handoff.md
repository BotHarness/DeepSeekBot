# Native model settings handoff

## Sub-features

- Model setup opens native Models, not the mobile app dialog, from welcome step 3, Home model configuration and a model-failure action.
- Native Settings temporarily reveals its own sidebar controls without changing the Bot main view. Closing Settings restores Bot navigation; cancellation and timeout release the handoff.

## How to get to it (user POV)

- First-run welcome: Bot mode → welcome step 3 (Models) → Open model settings.
- Home with an unusable model: configure the model → Open model settings. A model failure card has the same action.

## Driving it with verify-app

1. Build the Client, launch a task-owned isolated Host and run `doctor`. Keep ARIA and console evidence for each attempt.
2. On a fresh Chinese welcome flow, run `node scripts/verify-app.mjs shot models --name <n> --bot-mode --locale zh --click '3 模型' --click '打开模型设置 管理服务商、Key 和可用模型。' --wait '添加模型提供商'`. Require native `dialog "设置"`, heading `模型` and the Add model provider action. Confirm no mobile app popup is shown.
3. Repeat the entry actions, click native Close and wait for Exit Bot mode. Require the Bot main view and welcome model step to return. Repeat the Home and failure-card entry points when their preconditions are available; keep those results separate from first-run proof.

## Gotchas

- A generic dialog trigger may be Get mobile app. Native Settings is also available through Account menu; its `aria-hidden` keycaps must not change its accessible name.
- The welcome dialog itself contains Models. Wait for Add model provider inside native Settings, not that label alone.
- Complete opening and closing checks before creating or deleting fixture Bots. Roster changes can advance the welcome into the layout tutorial and invalidate the first-run precondition.
- Current rc.3 evidence proves opening. Close/return, Home and failure-card live checks remain pending; component lifecycle tests are not runtime proof.
- These paths do not prove saved credentials, model usability or native Desktop behavior. No model call is needed for navigation assertions.
