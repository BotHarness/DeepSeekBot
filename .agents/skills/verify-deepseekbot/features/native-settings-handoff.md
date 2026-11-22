# Native model settings handoff

## Sources

- `packages/client/src/client/bot-settings-open.ts`
- `packages/client/src/client/onboarding-view.tsx`
- `packages/client/src/client/features/channels/channel-message-body.tsx`
- `packages/host-client/src/model-settings.ts`

## Terms

- Settings
- Harness

## Sub-features

- The onboarding Model Choice picker and model-failure cards open the Models section of DSH settings.
- DSH settings temporarily reveals its sidebar controls. Closing DSH settings restores Bot navigation and preserves the conversation and any unsent draft.

## How to get to it (user POV)

- Early Tob DM with no usable model: enter Bot mode, dismiss first-run welcome, select Tob, enter a draft and press Enter. The Model Choice dialog (`Choose a model`) opens before sending. Select Open model settings.
- A model failure card for missing or invalid credentials, authentication or quota also offers Open model settings.
- First-run welcome step 3 now connects providers inline and opens Bot Settings → Model providers for an already configured provider. That journey uses Bot Settings.

## Driving it with verify-app

1. Build the Client, launch an isolated Host using `--no-ax-model --no-deepseek-secret` and run `doctor`. Keep ARIA and console evidence.
2. Use `shot --keep-overlays` to follow the early Tob DM path. Dismiss the preview notice and Harness Get started dialog when present, then dismiss the first-run Tobs welcome. Read the Tob row and composer names from the preceding ARIA snapshot.
3. In Chinese use `--locale zh`, `--click-text '打开模型设置'` and `--wait '添加模型提供商'`. Require `dialog "设置"` with heading `模型` and the Add model provider button. In English look for `dialog "Settings"` with heading `Models` and button `Add model provider`.
4. Repeat the open actions, close DSH settings and capture the result. Require the Tob conversation, unsent draft and Exit Bot mode to be present, with DSH settings closed. Repeat from a model failure card when a suitable failed-turn fixture is available.

## Gotchas

- The Chinese Model Choice picker is also named `模型`. Identify Models using the provider action within DSH settings.
- Account menu can open DSH settings when the sidebar does not show a direct trigger. Keep shortcut keycaps out of its accessible name.
- The early DM preflight holds the draft without a model call. Capture open and close before adding fixture Bots, as roster changes can advance onboarding.
