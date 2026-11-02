# DeepSeekBot video wallpaper (T6)

## Sub-features

- Up to 100 MB, actual decode/play validation, shared original/crop persistence and a mandatory saved poster.
- Muted loop without controls; background/blur/minimize pause retains the frame, foreground resumes.
- Playback error or restore decode failure shows the poster and a settings reason; CLI reports actual transient state.
- Source deletion/reload, crop, replacement/removal and Bot-mode exit release the correct resources.

## How to get to it (user POV)

Bot mode → Bot settings → Appearance → Upload image or video. Preview motion, drag/zoom, choose Use. The Wallpaper section shows video status and any fallback reason.

## Driving it with verify-app

Launch and doctor a task-owned Host. The fixture generator requires local `ffmpeg` with `libvpx-vp9`:

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-video-wallpaper.mjs
```

The journey creates a silent VP9 WebM, uploads through the visible file input, samples currentTime and decoded frames across multiple loops, moves to another tab and checks the time stops, then resumes. It compares original bytes/poster after deleting the source and reloading, creates a real media decode error, restores through a blocked decoder to the saved poster, uses CLI import/crop/status, refuses invalid media, and verifies exit pauses/unloads the old video. `--baseline` runs the prior image-only entry point on a base Host.

Native macOS uses an isolated official Desktop process/user-data directory. Verify actual loop samples and mute/control flags, minimize the exact task-owned window, compare stable time/paused state, restore/focus and verify progress. Cause a decoder error and inspect both poster pixels and the settings reason. Flush storage, restart the same application directory into a different isolated linked Host Profile, and compare original bytes/crop/poster before observing resumed playback. Keep tokens and source bytes private.

## Gotchas

- Use the accessible wallpaper input name; settings also contain a hidden icon-upload input.
- Discovery is read-only and may retry a poll gap. A delivered write timeout is never automatically replayed.
- Image previews and video preview resources must be released independently of the accepted wallpaper.
- Codec evidence is specific: report the format and runtime actually tested. Windows and Human QA remain distinct.
