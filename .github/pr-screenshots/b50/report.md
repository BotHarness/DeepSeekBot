# Batch50 composer QA: blocked before composer

- Composer source: da4f6cf7b074bf3e444efda5f9f772033a8a6401 (#2567, Draft).
- Frozen origin/main and attempted native Before: 8f4e650db551ae8458211634872ed291ff4e5a4f.
- Native: existing iPhone 17 Pro Simulator, iOS 27, signed Debug development app. No new device, erase, install or native rebuild.
- PASS compatibility: Expo58.0.17 / RN0.88.0; strict fingerprint2ab2d67bec3a3fd2186c6ea9cf85ceadb07c4b7a matches the qualified build receipt. Installed executable SHA256 cbf75e97a9776956bca0bcdf081a0dc5da2a6ba858d5bf4fbd26a58e3e5c62e7 equals the qualified saved product.
- PASS preparation: frozen-lock dependency installation, product build, authenticated isolated QA Host health. A synthetic Composer QA Bot was created through the public API.
- First dev-client URL launch did not start the app; direct app open plus its Enter URL manually/Connect UI loaded the baseline successfully. This recovery is setup, not a product pass.
- FAIL baseline prerequisite: opening a one-time invitation from the dedicated QA Host raises `[RNScreens] sheetPresentationController is null when attempting to set allowed detents`. The screenshot is the original failure; no error-overlay dismissal or restart is counted as success. Composer was not reached.
- BLOCKED combination: attempted to merge the previously verified Connect stack f73bb4ecb7ebbe5075c4d9c8591c29623c71152a into the frozen current-main baseline as a common before/after dependency. Git reported17 conflicts below. The runner saved the list and aborted the merge per device-qa rules; no manual conflict resolution, source-branch edits, or product PR merge.
- UNTESTED: all composer native before/after pairs, six theme/text cases, keyboard/multiline/caret, attachments, draft/focus, canonical native send, dictation start/stop/cancel. Stop here means dictation recording, not Bot cancellation. Android, physical-device, Human QA, CJK IME, orientation and VoiceOver remain separate/unrun.
- Cleanup: task Metro, dedicated QA Host and driver stopped; dev app terminated. Original light/large retained, original pairing files unchanged, no new Documents files. Only the derived notification-avatar status file changed during ordinary app startup; no private state is published. Existing Simulator/store app/native products/other resources preserved.

## Runnable next step

Source PR owners provide a current-main-compatible branch combining the required Connect pairing fixes and composer, with frozen exact heads and native input declaration (or an explicit corrected pairing prerequisite in main). Coordinator then refreezes the common Before and After, rechecks compatibility and executes the actual native matrix. This result does not reopen the historical paused backlog.

## Conflicted paths (merge aborted)

- `.agents/skills/verify-deepseekbot/features/README.md`
- `.agents/skills/verify-deepseekbot/features/remote-hosts.md`
- `packages/client/src/client/bridge-audio-resource.ts`
- `packages/client/src/client/bridge-audio.tsx`
- `packages/client/src/client/bridge-file-resource.ts`
- `packages/client/src/client/bridge-file.tsx`
- `packages/client/src/client/bridge-image-resource.ts`
- `packages/client/src/client/bridge-image.tsx`
- `packages/client/src/client/channel-message-body.tsx`
- `packages/client/src/client/locale.ts`
- `packages/client/src/client/private-account-controls.tsx`
- `packages/client/src/client/private-input-card.tsx`
- `packages/client/src/client/remote-conversation-view.tsx`
- `packages/client/src/client/tool-approval-card.tsx`
- `packages/client/src/client/user-question-card.tsx`
- `packages/client/test/bot-sidebar.test.ts`
- `pnpm-workspace.yaml`
