# Human Android control recording

Source: Human-supplied physical POCO screen recording of the installed minified arm64 Release
at `48351398e405c0964831ba0595cb45e2c0563c2c`. Its APK pullback matched the build. The Human
reported that the controls felt very good and explicitly ended duplicate agent acceptance.
The original 51.881-second recording remains in the private QA archive.

- `h0.png`: original timestamp 1 second, default preview.
- `hz.png`: original timestamp 18 seconds, zoomed preview.
- `h.mp4`: original timestamps 18–22 seconds, original playback speed, audio removed.
- `h.gif`: an 8 fps, 288-pixel-wide preview of that excerpt.

Opaque black privacy masks cover notifications, browser chrome, sidebar/recommendations and
taskbar regions; the clip uses a larger top mask to cover moving chrome. Pixels outside the
masks are from the supplied recording. No UI or remote desktop pixels were generated.
The clip/animation is not an FPS, latency, input-acknowledgement or optical-performance measurement.

These assets show the Human-tested intermediate implementation **before** the subsequent four
UX refinements: icon + short mouse labels, observation-only visibility, top-aligned free preview
and Reset view. They are not after screenshots or native acceptance for those newer commits.
Fresh native after captures were not made because the Human explicitly stopped repeated agent
acceptance. Source checks and review for the refinement are recorded separately in PR #2639.
