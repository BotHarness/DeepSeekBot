# Live Host state with push, snapshot, and fallback

Refresh Host-owned state from Host events in the Web Client and phone app. `pnpm lint` runs `scripts/check-fast-polls.mjs` to flag likely new polling loops under 10 s in client sources.

## The pattern

1. **Push.** Publish a change signal when the owning Host module commits the state. The `resource/changed` event carries `{ resource, revision }` as a signal to re-read the current state. See [resource events](../../packages/core/src/channels/resource-events.ts).
2. **Snapshot.** Re-read on mount, on the signal, when the stream opens or reconnects, and when the page or app returns to the foreground. Coalesce bursts and keep one read in flight.
3. **Fallback.** Use a slow refresh to recover from a lost signal. The Web resource observer defaults to 60 s while the stream is healthy and 10 s while it is down. Pause standalone fallback timers while the page is hidden.

Use the existing helpers for each client.

- The Web Client provides `observeResource(resource, refresh)`, `observeHumanAttention(refresh)`, and `subscribeMessagingDefaults` for roster commits. Use `visibleInterval(run, ms)` to pause a standalone timer while hidden and refresh on return. See [live subscriptions](../../packages/client/src/client/messaging-defaults-live.ts) and [visible intervals](../../packages/client/src/client/visible-interval.ts).
- The phone app uses `client.onResource?.(listener)` and an AppState `active` refresh. A resource value of `undefined` signals that the live connection is ready and the listener should re-read. See the [Host client](../../packages/host-client/src/client.ts) and [private input form](../../apps/mobile/src/ui/private-input-form.tsx).

## Adding a resource

1. Add the name to `liveResourceSchema` in `resource-events.ts`. Add it to `OWNER_ONLY_RESOURCES` when only the owner may learn that it changed.
2. Publish from the owning change path. For database-backed changes, subscribe to the matching commit topics as in [the Host plugin](../../packages/core/src/plugin.ts). Have periodic sweeps skip writes when nothing is due. See `dueCleanup` in [relationship enrollments](../../packages/core/src/devices/relationship-enrollments.ts).
3. Subscribe with `observeResource` (Web) or `onResource` (phone). Test refresh on the event, reconnect, and foreground return. Verify that a healthy idle stream triggers only the slow safety refresh.

## When a short timer is right

Some state has no event source, such as a QR scan in another app, an OS signal the client cannot subscribe to, or a DOM the page does not own. For repeated reconnect attempts, use backoff, for example starting at 1 s and doubling up to 60 s.

For such a timer, add its file to `scripts/fast-poll-allowlist.json` with the number of fast timers in it and a `reason` that says why no event fits. Entries that mark debt name the issue that removes them. When a file loses a timer, lower its count with `node scripts/check-fast-polls.mjs --update`. An entry counts timers; it does not name them. A change that swaps a timer in an allowlisted file keeps the count and passes, so the reviewer rechecks that the entry's reason still fits.

The check looks for `setInterval` below 10 s whose callback contains `await`, `void`, `.then()` or `fetch()`, and `setTimeout` below 10 s that schedules its enclosing function again. Use a numeric literal or a same-file numeric `const` for the delay so the check can resolve it.
