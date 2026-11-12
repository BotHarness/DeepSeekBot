# ADR-0322: Android text playback keeps conversation order in JavaScript

Status: accepted for an opt-in experiment

## Context

Android needs a native pacing candidate for matched device A/B testing. Moving conversation ownership into a native singleton would duplicate draft-to-message reconciliation and retain conversation text beyond subscription lifetime.

## Decision

`EXPO_PUBLIC_TEXT_PLAYBACK=native` selects an optional Expo module. Missing modules and every other value retain the JavaScript engine. Each conversation owns a shared native clock and each queue entry owns one shared native player. Native players reproduce reserve, warmup, punctuation pauses, bounded release, correction and flush semantics. Android ICU supplies grapheme boundaries; OS Unicode differences require device coverage.

JavaScript remains the authority for per-Bot order, draft/commit binding, history hold, app activity, completed-bubble settling and React publication. It selects the next players and requests one native frame at a time. Native advances only those players; the returned token wakes the existing conversation publisher. Pause, background and final unsubscribe cancel the pending request. Shared-object release cancels any remaining callback. No global player registry, durable data or Host contract is added.

## Consequences

This reduces JavaScript algorithm work but still uses JavaScript to publish each visible body. It does not claim to eliminate bridge cost or improve frame rate. Native snapshots and synchronization add cost to measure. The candidate stays off by default until matched physical-device evidence covers ordering, Unicode, corrections, background, history hold and frame intervals. No native spacer, RecyclerView or list ownership changes belong to this slice.
