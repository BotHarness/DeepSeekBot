# Android native evidence for #2714

Physical Android API 36, arm64-v8a, portrait 1220 × 2712 device pixels. These are app-only crops of a bundled-JavaScript Release build from frozen main `f5baef152fb3ad3cac07ff411e376d7fb979eb9c` (merged #2705 and #2711), not Expo Web previews.

- APK SHA-256: `702d6708a6117a9628ff0a2abb16d04bf986bbd7019dfcdc5e3c116d54dc21d5`; installed APK was pulled back and matched.
- Embedded JavaScript SHA-256: `3658b9c7c3f864a62d86a5215f85117fa60a9e668fd932413359236977e5a355`; differs from the prior installed build.
- Expo 58.0.19; strict Android post-CNG native fingerprint `da00bd93b5007e490109db5731ae9f4903a85dc6`.
- `s-*`: Settings rows; `l-*`: actual Compose language menus; `a-*`: actual Compose appearance menus. `10`, `13`, `20` mean OS font_scale 1.0, 1.3, 2.0; `l`/`d` mean selected light/dark. The device's system font-size resource lists 2.0 as its maximum.
- `chat-b`, `chat-zh`, `chat-en`: before/after returning from Settings to a synthetic, Bot-free QA channel with a three-line unsent draft. Settings were opened through the public app route with the chat retained in the native stack. Original chat, draft and message-anchor rectangles were compared separately from cold-launch preference persistence. Numeric native caret retention is unverified.

Raw screenshots/XML stay private. Published crops exclude system notification/status/navigation bars, device/computer identifiers, connection details and private conversations. An obstructed intermediate-font capture was discarded and retaken. Images have been visually inspected.

Known visual findings in this frozen version: the selected item uses a pink/purple tertiary-container color and shows duplicate leading/trailing checkmarks. A separate Human-requested follow-up fixes the option icons and accent selection; these images remain the pre-fix evidence.

iOS is explicitly deferred by the Human and is not qualified by these Android or prior Web results. #2714 remains open. Full results and cleanup are recorded on the issue.

Issue: #2714
Agent-Task: codex/local/01a166ee-4963-7660-9e23-f91eba8f2f5c
