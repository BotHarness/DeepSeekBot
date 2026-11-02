# Back to Chats: real Host and browser evidence

Issue #1938 / PR #1939. Captured on October 16, 2026.

- Fixed application source: `2230f8c2145e028006c15f283cde926ff2b44889`.
- Baseline source: `1d5ccf72a6e8a4db101253d40e081a518aa5b261`, exported before changing the notice callback. Its build stamp is dirty because the new component test and changelog were already present; the application callback is the baseline implementation.
- Evidence-only commits do not change the tested application source. The tested fixed bundle is `entry-716cc48f8e53fa70bc79402bab8772dc.js`.
- Isolated DSH `0.2.0-rc.2` Host; actual pairing form, Device HTTP/WebSocket transport, real DeepSeek model, real Activity cards, and public owner deletion APIs. No mocked router, roster, question card, or conversation state.
- Independent headless Chromium, English locale, 430 × 932 viewport, light and dark system appearance. No shared Simulator was used.

## Reproduction and result

For each theme and each DM/group conversation, run the baseline and fixed exports with fresh disposable QA entities:

1. Pair the app by pasting a fresh Host offer into the real pairing form.
2. Create a QA Bot and DM/group through the owner API. Ask the real model to produce a native question card.
3. Open Activity, click the question card, then press header Back: Activity remains the destination in both versions.
4. Reopen that card. Delete only the QA Bot (DM) or group Channel through the Host owner API while the conversation is open.
5. Capture the missing-conversation notice, then click its **Back to Chats** action.
6. Assert both the URL and the visible selected navigation tab: baseline `/activity` / Activity; fixed `/` / Chats.

All **8 differential cases passed**: four reproduce the baseline bug and four verify the fix. Both runs preserved the history-aware header Back behavior. `browser-results.json` records each result; page errors and console errors were both zero.

`*-notice.png` shows the full viewport immediately before pressing the action. `*-destination.png` shows the resulting screen; the top 70 pixels are cropped uniformly to omit the machine-identifying Host header (published size 430 × 862). The selected tab remains visible. Fixture IDs, Activity counts, model wording, and timestamps naturally vary across fresh runs. Deleting a Bot may cancel its active question/turn; those notices are deletion fixtures, not evidence of a normal DM failure.

## Live DM regression

With the fixed export, pair a fresh browser context, open a live QA DM from Chats, type “What is six multiplied by seven?” into its actual composer, and click Send. The real model returned **42**, which was absent from the prompt. Verify the Bot-authored entry in the canonical Host timeline and the rendered reply, then reload the app and confirm the reply remains visible without a missing-Bot notice.

**Passed**, with zero page/console errors. See `live-dm-results.json` and `after-live-dm-reply-light.png`. This screenshot uses the same top crop; the QA Bot was removed only after this check completed.

## Boundaries

- Earlier collaborative-browser checks also passed cold missing-DM → Chats and cold unknown-Channel → header Back → Chats. An unknown Channel is refused by the real Host and does not show the missing-notice action; it is not the deleted-open-Channel case above.
- Component coverage: 13 focused tests passed; full mobile suite 398 passed / 8 skipped. Root/mobile typecheck, lint, format, changelog check and build passed. Code-head CI, including isolated Host smoke E2E, passed; that smoke test is distinct from these mobile navigation journeys.
- This proves the Expo web preview against a real Host, not native UIKit/gesture behavior. Shared iOS Simulator QA is queued; native edge swipe, Android and physical iPhone remain untested for this PR. Human QA is still required. No merge or deployment is authorized.
