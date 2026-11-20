---
Status: Accepted
Date: 2026-11-19
Issues: [#4609](https://github.com/BotHarness/DeepSeekBot/issues/4609)
---

# ADR-0357: Card and context invalidations follow roster visibility

## Context

The Web Client renders approval and question cards in conversation history, Activity, and Window Companion. The selected Channel stream only follows the open conversation. Assignment execution can change while the matching card stays mounted in another view.

## Decision

Use the existing application-defined `resource/changed` frame on the authenticated roster stream. Approval and question invalidations carry a Channel and message ID. The Host checks whether the recipient can see the actionable request and checks the same authority again before sending a queued typed frame. Bot context invalidations carry a Bot slug and go to its active owner. The existing snapshot methods remain responsible for reading the current state.

## Consequences

- Every mounted surface can refresh the same request from the Host it belongs to. Reconnect takes a fresh snapshot.
- A missed signal recovers through the existing slow, visibility-aware refresh. There is no replay history for invalidations.
- The connection progress panel tails the existing diagnostic collector while visible. It can still show diagnostic records when the connection under diagnosis is down.
