# Version-bound Memory image and Markdown previews

## Sub-features

- Current `.png` files use the owning Memory reader, fit the available area, and enlarge through the existing image gallery.
- Working comparisons keep HEAD/index/worktree semantics; commit comparisons read the selected commit and first parent, including after a current file is deleted.
- Before/after panels stack on narrow Web viewports. Absent sides and unsupported, oversized or stale images have explicit states.
- The authenticated PNG route binds the owner, path, source and SHA-256 revision. `memory-image` exports the same bytes to a new file and prints one JSON receipt.

## How to get to it (user POV)

Enter Bot mode, select a disposable Bot DM in Channels and open Messages. Use the Messages header switches to open Memory files and select a PNG. Open Memory evolution and select its working change or a commit. Close the side panels to give the reader more room; the selected reader stays open. Click a ready image to enlarge it, then press Escape. Refresh the reader if mutable image content changed.

## Driving it with verify-app

Launch and doctor a task-owned isolated instance. Run `node scripts/e2e-memory-images.mjs --name <name>` against the built slice. The journey creates or reuses one synthetic PersonaBot in that instance, writes three visibly different PNGs into its repository, makes two commits and leaves a working change. It uses accessible controls to inspect current, working and historical content, verifies native image decoding, captures light/dark and narrow Web screenshots, and compares nine direct CLI exports, including staged and unstaged versions, with the actual Git/current bytes. An unauthenticated image read and a stale-content CLI export must fail; temporary index/file changes are restored.

For before/after review, run `node scripts/e2e-memory-images.mjs --name <name> --before` against the base build, then rebuild and restart only that instance's exact PID with the same Profile. Run the normal journey after the change. Fixture state stays within that named instance; screenshots and each failed attempt remain under its ignored verification directory. Inspect screenshots, ARIA snapshots and the final verification report before publishing sanitized evidence. `verify-app stop` removes the temporary Profile but retains verification evidence.

## Gotchas

This is the first Web PNG slice of #2214. JPEG/GIF/WebP/SVG, editor/file-card previews and mobile remain follow-up work; the second Web Markdown slice is documented below. A supported header is not decoding proof: the browser journey checks `naturalWidth`. Source/CLI transport tests do not replace Web rendering or Human QA. No model reply is needed.

The current dock opens Channels and Messages independently; selecting a Channel while Messages is hidden does not itself expose Memory controls. Use the Messages rail entry and its header switches. Image selection and diff source identities are separate from the existing Open current file action. All fixtures belong to the isolated test Host; never point this journey at an everyday or shared QA Profile.

At 700px, wait for the narrow shell to mount, select the Bot from its visible list, open Conversation settings, expand Memory, select the working change, then press Escape to close the overlay. Resizing remounts the conversation; a screenshot of the roster or an occluded old desktop view is not image evidence. The journey measures the two visible figure positions to prove stacking.

## Markdown documents (second Web slice)

Use the same Memory files, working change and commit entry points for `.md` / `.markdown`. Files default to rendered GFM documents; View source returns the original text. Diffs default to lines; Rendered preview displays the full Before and After documents, stacked on narrow Web viewports. Local inline PNGs follow the selected worktree/index/commit; relative paths start at the document directory, slash-prefixed paths at the repository root. Images are loaded when visible, expand through the existing gallery, and release temporary resources on source mode or navigation. Refresh reobserves mutable image dependencies.

Run `node scripts/e2e-memory-markdown.mjs --name <task-owned-instance>` after launch and doctor. It creates one synthetic Markdown Preview QA PersonaBot with two committed illustrated notes and a working change. The journey checks actual heading/table/image rendering, source and default line-diff behavior, working and first-parent historical image decoding, 700px stacked layout, enlargement/return, a missing-image result, nine CLI exports including staged/unstaged content, anonymous denial and stale-document refusal. It intercepts only the synthetic `https://preview.invalid/` image in the browser and serves fixture bytes with CORS: zero requests before the click and one after proves the consent boundary, not third-party server availability. Browser network restrictions on arbitrary external sites remain platform behavior.

For matched Before captures, build the base Client in a disposable baseline worktree, load it against a task-owned base Host with the same fixture, and run this journey with `--before`. Preserve both builds and first failures; restore the feature build and restart only the task Host without deleting its Profile. Inspect screenshots, ARIA, image byte comparisons and all unexpected console/page errors. Expected missing-image HTTP 404s are listed separately. No model call or native mobile check is needed for this Web journey.

Local inline PNGs keep the first slice's 25 MiB/dimension limits; Markdown bodies have independent 4 MiB limits. Other local formats, unsaved-editor and ordinary message-file previews, and native mobile remain later #2214 scope. Rendering does not execute raw HTML. HTTP/data/file/protocol-relative images stay inert; external HTTPS images require a per-image click, no referrer and anonymous cross-origin access. Historical missing images never fall back to current files.

## Mobile Memory reader (first native slice)

Pair the scheduled QA app with the dedicated QA Host. Open a disposable Bot's profile, expand Memory, enter its file tree and open `preview.png` or `notes/guide.md`. PNG files fit the phone, enlarge in the existing native viewer and share the same temporary file. Markdown defaults to GFM with Source/Preview tabs; local PNG references bind the observed worktree document revision. Pull to refresh after a stale result. External HTTPS PNGs need an explicit per-image tap and then visibility; cookies and Host credentials are omitted and redirects refused. Raw HTML and non-HTTP(S) links stay inert. Other image formats, editor/file-card previews and mobile Git diff navigation remain later scope.

Use the same synthetic repository as `e2e-memory-markdown.mjs`. `MOBILE_LIVE_HOST_URL` (private login URL, environment only) and `MOBILE_MEMORY_FIXTURE` (private fixture JSON path) enable `pnpm exec vitest run apps/mobile/test/memory-preview.live.test.ts`. It pairs one test device, uses the mobile Host client and preview adapter with Node byte IO, matches five exports against actual current/Git bytes, checks anonymous/traversal/missing/stale refusals, restores the document and revokes only its new device. This is Host/client contract proof, not native decoding, filesystem or UI acceptance.

Submit the exact PR/head to the shared device QA queue before driving native UI. Capture matched light/dark PNG and Markdown readers, Source mode, enlargement/close, native Share open/cancel, a missing-image result and a below-the-fold lazy PNG. Switch documents while loading and verify no late image replaces the selected file. Correlate the selected document hash and image bytes with the Host fixture. Include large text, scroll/Back retention and the existing chat viewer in regression steps. A shim interaction test or Expo bundle export cannot qualify native rendering. Android and physical-phone checks stay explicitly unrun unless scheduled.

## Remaining image formats

Current readers and existing working/commit/Markdown previews accept JPEG/JPG, GIF, WebP and safe static SVG alongside PNG. MIME follows detected bytes, not the filename. Successful Host/CLI/mobile transfers preserve original bytes, including GIF/WebP animation and SVG source. `packages/core/src/media/image-format.ts` owns the pure shared format/SVG policy; the existing Memory Service still owns repository/source/revision authorization. The route permits validated inline SVG CSS but blocks all other resource loads through CSP; Markdown Blob URLs remain image-only contexts.

Run `node scripts/e2e-memory-formats.mjs --name <task-owned-instance>` on a clean rebuilt candidate. For the baseline use `--before --expected-source <base-sha>` with the same task-owned Profile and its actual base worktree/CLI; Hosts run sequentially. The journey preserves first failures, checks pixels and GIF/WebP frame advancement, exports 40 source-correct current/staged/unstaged/history/inline reads and measures narrow stacking.

The reusable 160x90 fixtures under `packages/core/test/fixtures/memory-images/` contain three distinct versions of every format and two-frame GIF/WebP samples. Verify their current/staged/unstaged/history and local Markdown reads, MIME/byte hashes, actual browser decode/colours/animation, narrow before/after stacking and enlargement. Compare the same fixture on base and feature builds for matched screenshots. SVG malicious fixtures must be refused without script execution or external requests; original-file download remains independently authorized. Native real decoding, GIF/WebP animation, SVG presentation and same-byte sharing still require the shared device queue; adapter tests and bundle exports are separate proof.

SVG is a bounded static subset: 1 MiB source, 10,000 nodes, depth 64, 64 KiB CSS and 20,000 expanded nodes. Active elements, external references, foreign HTML/images/filters/animation, DTD/processing instructions and cycles are refused. Raster limits remain 25 MiB and 16,384 per axis/40 million pixels; animated GIF/WebP additionally allow at most 256 frames and 40 million canvas pixels across frames. This is a rendering policy, not a generic arbitrary SVG execution or file-reading capability.
