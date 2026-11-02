# DeepSeekBot image wallpaper (T5)

## Sub-features

- Wallpaper library: a horizontal strip with a dashed **Add** tile first (click or drop several files), a **None** tile, then every saved item; picking a tile applies it at once.
- Adding saves with a centered crop; **Adjust crop** on a tile opens drag/zoom for that item; deleting the shown item moves to the next one.
- **Switch automatically** (off, 1/5/15/30 min, 1 h; default 15 min) and **Shuffle** (default off) appear once there are two or more items; rotation follows the clock, so windows agree without writes.
- The first wallpaper switches panels whose opacity/blur were never tuned to header 80%, body 50% + 2px blur.
- One continuous sidebar/panel layer, cover geometry across resizing, no input interception and no native DSH wallpaper.
- Original bytes and crop survive deletion of the source and refresh; light/dark modes share the media.
- Decode/storage failures preserve the accepted image; targeted CLI uses the same Client owner.

## How to get to it (user POV)

Bot mode → Bot settings → Appearance → Wallpaper. Click or drop images up to 20 MB on **Add**; each appears as a tile and the newest is shown behind the workspace. Hover a tile for **Adjust crop** (drag, Zoom, Save) and **Delete this wallpaper**; **None** keeps the library but shows no wallpaper.

## Driving it with verify-app

Launch and doctor a task-owned Host, then run:

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-image-wallpaper.mjs
```

The journey uploads a generated PNG through the real file input, adjusts and cancels its crop, checks original IndexedDB bytes (`library` index plus `item:<id>` records), deletes the source, reloads, resizes, changes theme, injects a quota failure and tries corrupt media. It calls the built CLI to import/crop/remove, checks unrelated preferences, then exits Bot mode. Screenshots, ARIA and sanitized proof remain in its unique attempt directory. `--baseline` captures the previous settings/workspace on a separate base Host.

Desktop qualification requires a task-owned official application and user-data directory. Verify native upload and recrop, restart that same application directory into a different isolated linked Host Profile, compare the saved original/crop and confirm Web storage remains independent. This is a native different-Host restart, not an interactive connection-switch test.

## Gotchas

- The file input and the add tile are both named **Add wallpaper**; tile actions are named **Adjust crop · Wallpaper N** and **Delete this wallpaper · Wallpaper N**, and the crop editor's button is **Save**.
- A UI upload is committed immediately. Failed writes must keep the old library and URL. A pre-library `current` record is migrated into the library on the first write.
- The media revision is independent of the appearance preference revision. Reload changes the transient Client id; rediscover and select the right Client before CLI writes.
- Pixel content is under translucent panels only when their materials allow it. The wallpaper layer itself never applies opacity to messages or controls.
- Video is covered by [video-wallpaper.md](video-wallpaper.md); aggregate reset/recovery, Windows native and Human QA are separate gates.

Zoom regression: `node scripts/check-wallpaper-zoom.mjs` bundles the actual wallpaper layer into a Chromium fixture and checks full coverage and stable screen-space crop at all 17 desktop zoom levels in wide and narrow viewports. `--baseline` runs the current `origin/main` layer and retains a failure screenshot when it reproduces. This fixture does not qualify native window controls or media codecs; the mount regression separately covers video/poster geometry and resource identity. In Desktop, reuse the existing isolated Profile, import a generated grid through `wallpaper-import`, change zoom through `window-zoom-set`, then compare the native window before/after at the same size. Preserve and restore any existing local media and preferences.

Wallpaper chrome regression: `node scripts/check-wallpaper-chrome.mjs` compiles the real workspace, appearance and wallpaper styles and checks their combined cascade in Chromium. Light/dark, windowed/fullscreen, both stylesheet orders, global/per-Panel Header overrides and representative zoom extremes must retain transparent header gaps and the 88 × 40 physical macOS safe area; removal must restore the ordinary canvas. This is CSS-fixture evidence, not native-control qualification. In the same macOS test window, compare the header gaps and traffic-light backing before/after in both window states; keep native controls, title clearance and window drag intact. A macOS screen-sharing indicator is system UI and is outside the wallpaper paint owner.
