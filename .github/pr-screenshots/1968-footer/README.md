# PR #1968 runtime evidence

- Before: main `d617fd94a0d5699c39be07591435d701267e51b0`.
- After: runtime source `95bba0cd7` (includes fixes from `59b1a5032`).
- Environment: isolated DSH 0.2.0-rc.2, real configured model, synthetic Footer QA DM/group.
- Matched before/after: 1440×900 desktop, light/dark, cropped to the chat/footer; 390×900 responsive Web. The same persisted QA conversation was used on both revisions.
- Defaults: model/workspace left, token usage right, speed off. All desktop chips share a row, with `nowrap` / `ellipsis`; 900/820/760/390 px layouts had no horizontal overflow.
- Eight complete browser interaction rounds passed across two runs: speed on/off, pointer insertion and side changes, keyboard side changes, Escape, reload persistence, hide-all and reset. Shift+F10 menu opening was exercised. The group menu exposes only workspace/speed/layout/reset; its phone footer is hidden.
- A new real reply persisted `{outputTokens:647, elapsedMs:18399, estimated:false}` and displayed 35 tok/s. Earlier estimated data remains labeled. Hidden idle made no extra average-history request.
- Client suite plus Core performance tests: 1808 passed, 1 skipped. Root TypeScript, formatting and build passed. Independent Standards and Spec reviews have no remaining findings after fixes.
- Original failures remain in private task evidence: the initial model route returned quota errors; the configured official test route succeeded. Puppeteer's default clipped screenshot independently reproduced a transient 1×1 viewport even on a blank page; `captureBeyondViewport:false` removed the resize. An SSE network-idle reload timeout was replaced with explicit visible-control readiness. These are not claimed as product fixes.
- Screenshots are runtime evidence, not native-device QA or deployment evidence. CI status is available on the PR.
