---
Status: Accepted
Date: 2026-10-10
Issues: [#1322](https://github.com/BotHarness/DeepSeekBot/issues/1322)
---

# Local browser takeover reuses the Computer viewer family with an ask-permission handoff

The local Bot Browser viewer was observe-only (static screenshot plus tab list) while takeover existed only for container targets, so logins and verifications on a headless VPS were stuck with no human window into the browser. Computer use already solved the same problem with its Host-served viewer infrastructure. We decided that **the local browser reuses the Computer viewer family (Host-served viewer endpoint plus the shared RemoteViewer primitive) for the human path, with full input from day one and an ask-permission handoff owned by a dedicated takeover seam — not a second viewer stack, and not CDP screencast for humans.**

## Decision

- **Transport reuses the viewer family.** The local browser serves `/botharness-browser/viewer/local/` through the same Host webServer prefix pattern as the container and Computer viewers, and the Browser entry renders it through the shared `remote-viewer` primitive. CDP screencast stays bot-side only (observe/screenshot); it is not the human path, because synthetic CDP input breaks Chinese IME composition while the human's own device composes natively before committed text is sent.
- **Full input from day one.** Click, scroll, and keyboard entry (committed text via `Input.insertText` plus control keys) travel through the viewer endpoint and require an active Pause, so logins are completable. Small viewports default to trackpad mode (swipe moves a virtual cursor, tap clicks) with a direct-tap toggle.
- **Ask-permission handoff.** The bot pauses via `browser_takeover` action `request`, which mints a single-use link (TTL at most 10 minutes) carrying instructions; the bot posts a guiding message with that link, then `await` blocks for Done / Could-not-finish / expiry, verifies page state server-side from the current tab, and resumes (which invalidates stale observation refs). Expired or already-used links are rejected.
- **Secrets never ride chat, logs, or echoes.** Credentials are typed only in the live view; viewer notes, tool audits, and responses record character counts, never content, with sentinel negative tests locking the rule.
- **Audit is append-only.** Mint, accept, input (redacted), complete with reason, and expire events accumulate per handoff and are retrievable with the session recording; no deletion path exists.

## Considered Options

- **CDP screencast as the human path:** rejected. It adds a second streaming stack to operate next to the noVNC-style viewers the team already runs, and per-keystroke synthetic input breaks IME composition.
- **Container-only takeover:** rejected. It leaves the default local target (and every headless VPS install) without a human window.
- **Bot-relayed credentials (human pastes secrets in chat):** rejected. Chat, logs, and tool echoes would all carry secrets; the GrokBot-style rule keeps them in the live view only.
- **Second viewer component for the browser:** rejected. The shared `remote-viewer` primitive already owns interactive toggling, scaling, and fullscreen behavior for both existing consumers.

## Consequences

- New seams: `packages/browser/src/viewer-local.ts` (Host-served local viewer page, frame stream, pointer/keyboard input, handoff banner) and `packages/browser/src/takeover.ts` (single-use token lifecycle, waiters, append-only audit plus recording). The `browser_takeover` tool (request/await/status) is the bot side of the handoff.
- Takeover availability follows the per-bot Browser Access switch, and human input requires Pause; resuming invalidates observation refs as before.
- Community sandbox tool policy is unchanged by this slice: where interaction tools are allowlisted read-only, the new `browser_takeover` tool needs the same operator decision as the rest of the interaction set.

## Amendment 2026-10-10: watching is the default, takeover is explicit

Human testing showed that pausing on every viewer open destroys a wanted behavior: opening the viewer to watch the Bot work must never interrupt it. The header model is therefore watch-by-default with an explicit takeover switch, not open-to-interact:

- Opening the viewer (or the fullscreen) never pauses; the Bot keeps acting while the Human watches.
- A header takeover toggle (接管 / 取消接管) pauses and enables input; releasing resumes, unless a bot-minted handoff link is still pending, in which case the pause stays until the handoff completes or expires.
- The manual sidebar pause and the `browser_takeover` tool flow are unchanged; resuming still invalidates observation refs.
- The fullscreen header carries only the title (`{bot}的浏览器`, 接管中 suffix while taken over), the input-mode switch, the takeover toggle, and collapse.Stop lives outside fullscreen. Narrow headers collapse button labels to icons.
- On desktop the viewer page hides its control rows and types straight from the physical keyboard; on touch devices a gamepad-scale pad (click, right-click, scroll, keyboard summon) plus a latching modifier row drives input, and the native keyboard is summoned by tapping rather than by a visible input box.

Related glossary: Browser Takeover (explicit control), Browser Watch (non-interrupting observation), Browser Pause (manual stop).

## Amendment 2026-11-03: the handoff is an asynchronous conversation card ([#3379](https://github.com/BotHarness/DeepSeekBot/issues/3379))

The blocking `browser_takeover` request/await flow is replaced by one Takeover Handoff shared by Computer and Browser:

- The Bot calls `takeover_request` with a target (`computer` or `browser`), a title and one sentence. A card in the conversation shows them with a Take over button that opens the live view; the Bot's turn ends at once and the Human can keep chatting.
- Done, Could not finish, cancel and expiry post a resolution message that wakes the Bot through its Inbox. The Bot observes again before it acts, so stale observation refs stay invalid.
- The secret rules above are unchanged: credentials are typed only in the live view, the card text must not ask for them, and the `takeover` diagnostic events carry ids, counts, lengths and timings only.
- The handoff does not pause or own control; who controls the view stays with the viewer's takeover switch.
