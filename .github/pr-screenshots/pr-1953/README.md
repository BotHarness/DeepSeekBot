# PR #1953 visual verification

Captured on 2026-10-16 with a real isolated DSH 0.2.0-rc.2 Host and Chromium, 1440 × 600, Chinese locale, dark and light themes.

- Before Client: `ba53c5fbf69f05e91c81c4caa3fe645cb16465a3`.
- After Client: `42111dc0484f6045f875f3d893b3c3343c78c1d8`.
- The two changed Client source files were built at each revision; all other runtime source is identical. Final runtime was restored to the After source.
- Same isolated Profile and data for both: 24 native Sessions created through the DSH API, with canonical Bot ownership seeded offline through the owning module while the Host was stopped; one real Orchestrator Session. No mocked UI responses.
- The QA Bot used DeepSeek official to create a real pending question. Scroll the chat to earlier messages to expose the activity disclosure; no need to answer the question.

## Reproduce

1. Open the QA Bot DM and its Sessions panel. Keep the same viewport and scroll the chat away from the latest message.
2. Capture the activity disclosure collapsed, click its summary to expand, capture it, then collapse it again. Assert the native `details.open` state and record the computed chevron transform.
3. Observe `Element.prototype.animate` without modifying the animations. Scroll the Sessions panel by 150 px.
4. Create an additional native Session through `session/create`; the native catalog update refreshes the owned list without changing those 25 rows.
5. Capture the list after the update and collect animation calls for 600 ms. Repeat with the other Client revision and the same Profile.

## Results

- Before: collapsed arrow points down; expanded arrow points up. All 25 rows receive spurious 150 px animations after scrolling; repeated renders amplify the movement (175 calls in this capture).
- After: collapsed arrow points up; expanded arrow points down. The same update produces zero row animations.
- Browser console: no page errors or warnings in the completed paired runs. Dark and light screenshots inspected.
- `measurements.json` contains sanitized geometry and animation evidence. Static list images show the sampled state, not the whole animation; use the reproduction above and measurements for the motion claim.
- The existing startup diagnostic collector reports `shell-lost` during entry into Bot mode on both revisions; the actual Bot UI remains mounted and interactive. This baseline diagnostic limitation is not treated as a clean startup-collector pass.
- Initial model attempts hit the configured Go quota; only this QA Bot was switched to the already configured DeepSeek official route. No external IM was used.

Task: `codex/local/01a1444d-5968-7420-a318-875cd1f4dae1`. Product source is unchanged by this evidence follow-up.
