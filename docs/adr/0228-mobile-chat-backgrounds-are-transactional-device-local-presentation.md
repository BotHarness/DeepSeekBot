---
Status: Accepted
Date: 2026-10-18
Issues: [#2118](https://github.com/BotHarness/DeepSeekBot/issues/2118)
---

# Mobile chat backgrounds are transactional device-local presentation

The Human wants personal chat images with readable messages, a convenient default and different choices per conversation. Host appearance and PersonaBot Profile Banners decorate other surfaces. Sending these private pictures to the Host would introduce synchronization and identity semantics that the feature does not need.

## Decision

An application-defined mobile owner resolves one device default and optional overrides keyed by the saved Host ID and Channel ID. Labels and connection URLs are not keys. Removing an override resumes inheritance; the global Default means the current theme canvas. This extends the local presentation boundary of ADR-0219 without changing Host configuration, PersonaBot identity, Memory, Channel Messages, exports or telemetry. There is no new DSH Service, SessionEvent, bridge method, HTTP route or Bot tool.

An editor owns a disposable draft. Choosing a photo, a solid color, Fill/Fit, normalized alignment or background fade changes only that draft. Done writes a complete versioned preference record before notifying subscribers. Failure retains the last committed choice and the retryable draft. Cancel, back and dismissal release the draft. Concurrent editors cannot overwrite a changed selection from an old snapshot. An inherited image is a read-only preview; only an explicit image choice enables crop and fade editing. Conversation routes require a valid saved Host and Channel scope; only Settings can open the device-default editor without parameters.

The native adapter accepts picker-reported still images up to 16 million source pixels, with neither dimension above 16384 pixels. It rejects missing/invalid dimensions before creating the image context, schedules proportional resizing before the first render, and normalizes to JPEG with a maximum output edge of 2048 pixels and quality 0.88. The copied file must be nonempty and at most 16 MiB. This bounds the accepted source bitmap as well as output/storage work; a larger source must be reduced outside the app first. The native decoder may still allocate the accepted source bitmap. The adapter copies the result into this feature's persistent document directory before exposing it as a draft. Preferences contain owned basenames and dimensions, never temporary picker URIs or absolute container paths. Reconstructing the path from the current document directory supports app-container relocation.

Metadata uses monotonically numbered complete records. A partial newer record cannot replace the previous complete one. A file read failure is distinct from incomplete JSON and fails hydration even when an older complete record is readable. Readback reconciles a write that completed before its error was reported. Old metadata cleanup cannot turn a committed write into a reported failure. The owner reclaims only feature-owned images unreferenced by committed preferences and live drafts, rechecking references after asynchronous work. Failed hydration blocks saves and image collection until a fresh owner successfully reads the metadata, normally after reopening the app; safe fallback must not overwrite unknown preferences or destroy potentially recoverable files.

The conversation mounts one noninteractive canvas/image/veil sibling before its keyboard-responsive content. Neither the timeline nor individual messages own the image. Fade is the theme canvas veil's opacity: 0% preserves the image and 100% covers it. Ordinary content surfaces retain their opacity. Fill/Fit preserve aspect ratio; normalized alignment survives viewport changes. Only cropped preview axes accept drag/accessible position adjustments. Preview appearance is isolated from the app's system appearance.

Each owning drawer keeps its background editor inside one native SheetStack. Android Bot and Group drawers use a full-height detent: native checking found that changing detents only after a child push left the partial sheet's editor footer outside the visible viewport. Settings was already full height. iOS keeps its existing drawer detents and requires separate native qualification.

## Alternatives and consequences

- Reusing Host-look persistence would couple unrelated surfaces and its best-effort write behavior would violate transactional Done. A separate local owner makes failure and image lifetime explicit.
- A single overwritten settings file could lose the previous complete choice on interruption. Revision records cost a small amount of metadata; only the latest two complete generations are retained after successful writes.
- Cloud/Host storage would allow synchronization but require an upload and a new remote authority. Pictures remain private to this installation; reinstalling or clearing app data can remove them.
- Native iOS and Android picker, keyboard and system-text behavior require separate qualification. Unit and rendering tests do not establish the unavailable platform's result.
