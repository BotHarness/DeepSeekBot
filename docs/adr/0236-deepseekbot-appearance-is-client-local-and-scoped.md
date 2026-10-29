# ADR-0236: DeepSeekBot appearance is Client-local and scoped

- Status: Accepted
- Date: 2026-10-19
- Scope: DeepSeekBot Web and macOS Desktop, T1 only
- Spec: [#2256](https://github.com/BotHarness/DeepSeekBot/issues/2256)
- Implementation slice: [#2258](https://github.com/BotHarness/DeepSeekBot/issues/2258)

## Context

DeepSeekBot's Appearance page previously wrote the DSH-native Host theme. Users need independent light/dark/system selection, separate presets and Primary colors for each mode, and device-local persistence. This must not change DSH's native settings or PersonaBot identity colors.

## Decision

`Appearance` is the application-defined Client authority. It stores one versioned document at `botharness:appearance:v1` in localStorage. Web uses browser/site storage; Desktop uses its fixed `dsh-app://app/` origin and application user-data directory. Neither the key nor the document contains a Host identity. Web and Desktop do not synchronize. A storage event refreshes another tab in the same browser/site. System mode observes the local media query.

Each mode selects Classic Blue or Mist Purple and can override Primary. Selecting a preset clears that mode's Primary override, retaining the other mode, unknown future fields and all unrelated settings. Every write rereads storage; an explicit expected revision refuses a stale CLI write. A storage/parse/version failure preserves stored bytes and the last accepted rendering and reports failure. There is no optimistic persisted-success state. localStorage does not offer cross-tab compare-and-swap: concurrent writes are last-writer-wins; revision checks detect an already observed conflicting write, not a transaction across processes.

A disposable stylesheet applies palette variables only to DeepSeekBot roots, the enabled workspace mount, and explicitly marked owned modal/menu surfaces. It never mutates `body[data-ds-dark-theme]`, native theme services or native preference storage. Existing native primitives retain focus, dismissal and positioning behavior. Scope removal restores inherited native values. PersonaBot source colors and error/warning/success roles retain their own semantics.

The pinned native baseline in `appearance-native-tokens.ts` is derived from `@deepseek-ai/dsh-client-ui-theme@0.2.1-rc.2`, MIT licensed by DeepSeek. Its license is retained in `packages/client/appearance-palette.LICENSE`. It flattens the upstream design-platform, gradient/shadow and Shiki token declarations into local light/dark maps, not global selectors. Recheck this adapter when the pinned DSH palette changes. Feature styles continue to consume the existing semantic token aliases; this is not a new global theme registration.

## Direct Client control

`appearance-clients`, `appearance-get` and `appearance-set` use an authenticated `connection.fetch` route, `/api/botharness/appearance-control`. The Host holds only bounded, ephemeral delivery leases and one pending request per Client, never preference snapshots or a durable mirror. The route uses DSH's existing authentication boundary; it does not install a second `/api` interceptor.

A Client registers a fresh id and private polling token on mount. CLI callers must select an id; writes also require the revision returned by a live read and a JSON patch on stdin. A request is sent only to that Client's waiting poll. The same local owner processes UI and CLI writes, then acknowledges the accepted snapshot. Missing, stale, busy or unavailable targets, expired delivery, invalid input and storage failures produce coded refusals. No broadcast, inferred target, queued offline mutation or automatic write retry exists. A timeout has an unknown outcome if delivery already occurred; read again before retrying. Leases expire after 30 seconds, polls after 15 seconds and requests after 8 seconds; disposal clears leases and pending callers.

This is not #2095's native Host-theme/locale control. Native language, notifications, geometry, wallpaper, transparency, blur and per-panel settings are outside T1. Only T1 is implemented; sibling slices wait for Human QA of this first path.

## Verification boundaries

Owner tests cover mode independence, restart restoration, unknown-field retention, failed writes and revision conflicts. Delivery tests cover exact targeting, private poll tokens, expiry and refusal propagation. The feature map supplies runnable real Web and task-owned macOS Desktop journeys. Source tests, runtime evidence and Human QA are separate gates; this ADR does not assert an unrun platform passed.

## T2: global materials

Each mode may hold partial `materials.header` and `materials.body` values: six-digit `color`, `opacity` from 0 to 100 percent, and `blur` from 0 to 40 CSS pixels. These are application-owned surface properties, not a DSH theme or layout setting. Each field resolves against that mode's selected preset. Classic Blue retains the opaque neutral panel baseline; Mist Purple, Forest Green and Warm Amber supply translucent, blurred defaults in both modes. Explicit user values are not automatically recolored for contrast.

Changing a preset clears the known Primary and global material adjustments for that mode, retaining the other mode and unknown future fields. The same local owner and explicit Client CLI patch process every field; no Host preference store is added. CSS paints the Dock header and content container, with alpha only in the background color and blur only in backdrop-filter. Internal roots and the Control Rail stop painting redundant opaque backgrounds. Dock geometry, message bubbles, cards, inputs and scoped modal/menu palettes remain independent. A controlled background pixel comparison verifies actual blur separately from computed-property assertions. Wallpaper assets and panel-specific overrides belong to later slices.

## T3: functional Panel overrides

Each mode's `panels` map stores partial Header/Body materials by `dock:<functional-registration-id>`. The registered Dock catalog provides labels and target availability; the local appearance owner remains the sole preference authority. Closing or changing the Panel content does not remove its configuration. The Header-only context menu opens an opaque, locally themed modal; it does not introduce a global Panel editor or a visible ellipsis button.

Each property resolves target override → mode global material → preset default. A null field in a Panel patch removes that field; a target reset removes only that target in that mode. Global preset selection retains Panel overrides. Active Dock-tab group selectors paint the Header/content surfaces directly, avoiding inheritable per-panel material variables that would incorrectly impose parent overrides on nested containers. Nested presentation targets are a separate slice.

`appearance-targets` uses the existing explicit-Client read request and returns the registered target catalog alongside the local snapshot. Panel writes share `appearance-set`, revision checks and storage refusal. Missing or duplicate target identities refuse instead of selecting another target; unregistered saved overrides remain available when that registration returns. No new Host preference authority is introduced.

## T4: nested surfaces and independent contributions

Nested Channel Panels use the same registered functional identity as their outer Dock counterpart. Header and Body paint selectors address each surface directly; child fields resolve against global mode/preset values, never a parent override. Transparent paint still composites with the physical parent behind it. No element-wide opacity/filter is applied to descendants, remote viewer frames or plugin content.

The built-in `dock:memory-details` target covers file preview, commit detail and working-tree change views. It is distinct from `dock:memory-files` and `dock:memory-evolution`. `dock:generated-files` covers the Channel file side panel; Inbox and Members reuse their existing registrations. These are Client-owned functional surfaces, not new domain stores. Headers expose only the existing context-menu route to the same modal. Content actions and layout ownership remain unchanged.

An independently loaded QA Bundle under `scripts/fixtures/appearance-panel` consumes the current application-defined `dockPanels` service. Its registration gets the generic Header and paint wrapper without importing appearance internals. Disposing a contribution removes availability, refuses targeted writes and retains saved preferences for a later registration. This verifies the existing seam; it does not implement the broader Panel Plugin migration in #2219/#2234.

## Image wallpaper media (T5)

`Wallpaper` owns Client-local media independently of the small preference document. IndexedDB `botharness-wallpaper-v1`, store `assets`, key `current` contains one original Blob plus dimensions, normalized crop center, zoom and revision. An atomic read/write transaction compares the expected revision and replaces or deletes that one record. Decode and persistence precede the visible swap; a failure retains the accepted image. Replacing the record reclaims the obsolete asset without a media history. Object URLs are disposable render/preview resources, revoked on replacement, cancellation or disposal. Images are bounded to 20 MiB and must actually decode. Crop preserves the original and uses cover scaling, clamped to avoid blank edges.

The same wallpaper spans both color modes and is mounted once behind the enabled DeepSeekBot workspace, including the sidebar and panels. It receives no input; disabling Bot mode removes the layer without changing DSH theme or media. Web origins/browser profiles and Desktop's stable application origin keep independent stores. Same-origin tabs refresh through a bounded change notification, without broadcasting media bytes.

`wallpaper-get/import/crop/remove` target an explicit online Client through the existing ephemeral appearance delivery route. Import reads the CLI machine's file, sends ordered 192 KiB chunks into one expiring Client-side staging receipt, and commits through the same media owner. The Host transports each bounded chunk but keeps no media mirror or file path. Upload receipt expiry, size, offset, revision and command deadline checks refuse stale or ambiguous writes. A delivered timeout may have an unknown outcome: reread before deciding to retry. Video and aggregate recovery remain separate slices.

## Video wallpaper lifecycle (T6)

The same `Wallpaper` record now accepts `kind: video` with the original Blob and a mandatory poster Blob in the same transaction. Import requires real muted playback with decoded frames and a finite duration; filename/MIME alone is not evidence. Video is capped at 100 MiB, image at 20 MiB. A bounded poster (longest side at most 1920 px) is generated from a decoded frame; the original video is neither compressed nor transcoded. Preview and accepted playback have separate disposable lifetimes but share decoding and crop geometry.

The visible video has muted/defaultMuted, loop and playsInline enabled, controls/PiP disabled, no input, and no audio interaction. Document visibility and window focus pause/resume it; background pause retains the current frame. Leaving Bot mode or replacing/disposal removes listeners, pauses and unloads the old source. Error, blocked autoplay, unexpected foreground pause or prolonged decoder stall switches to the saved poster. On restart, a previously accepted but currently undecodable video can restore that poster without replacing the original record. Settings show the reason. Runtime playback state is transient Client observation returned by `wallpaper-get`, not a new Host or persisted preference authority. Reduced-motion preference does not silently override the Human's wallpaper choice.

The existing explicit-Client CLI transfer now admits video-sized staging receipts, retaining ordered chunks, revision/expiry bounds and the same final decoder/persistence checks. Format support must be qualified per runtime; a screenshot is not evidence of looping or background pause.

## Recovery scopes and partial failure (T7)

Clearing Panel overrides removes only the selected mode's complete functional target map, including currently unregistered targets, and preserves every other field. It uses the normal appearance patch/revision owner. Full recovery is a separate explicitly confirmed coordinator over the existing appearance and media owners; the normal patch route cannot invoke it. It preflights both revisions and storage reads, commits default appearance through `Appearance.reset`, then atomically removes the sole media record through `Wallpaper.remove`.

These two browser storage domains are not claimed to be one atomic transaction. If preference persistence fails, media removal never starts. If preferences commit but media removal fails or conflicts, the result is `appearance-reset-wallpaper-failed`: defaults are saved, current media is retained, and the UI explicitly says to retry. CLI callers reread both owners and retry with current revisions. No rollback overwrites another writer, no false full-success acknowledgment is sent, and the media record never points to a separately deleted Blob. A delivered timeout still requires rereading before retry. There is no reset journal or duplicate preference authority.

Accepted media replacement/removal advances a transient resource generation so settings discard stale previews, including reset with an empty saved wallpaper. Preview and accepted video sources stop/unload through their existing disposal paths. Recovery controls and confirmation use opaque app modal surfaces and outline buttons, independent of Panel paint and custom Primary fills. Confirmation names both palettes, mode, all overrides and shared wallpaper while excluding DSH, identity, business state and layout.
