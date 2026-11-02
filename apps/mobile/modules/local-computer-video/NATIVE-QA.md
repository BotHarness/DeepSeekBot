# Native cleanup regression — pending execution

This is an executable debugger-assisted native QA procedure, not an automated pass. Run
only in the testing center's assigned Windows/physical-Android batch against its rebuilt
Debug APK and isolated Host. The module currently has no JUnit, Robolectric or Android
instrumentation runner configured. Sibling modules' test dependencies are not inherited
here. No new test dependency or framework is introduced for this procedure.

Record batch SHA, native fingerprint/APK, Host/helper provenance, phone ABI, and each
`pass / fail / untested` outcome. Keep offer SDP, device identifiers and screenshots with
unrelated screen content private. A native source breakpoint is fault injection, not a
production setting, and it must be removed before normal performance measurement.

## Set up controlled disposal

1. Through the existing authorized Android QA workflow, build/install/open the Debug app,
   pair with the batch Host, and establish moving video. Keep this viewer observing; do not
   take control. Attach Android Studio's Java debugger to this app process.
2. In `LocalComputerVideoView.kt`, set a breakpoint on the first native-release invocation
   inside the `worker.execute` body of `Attempt.close()` (the `listOf<() -> Unit>` teardown).
   Set **Suspend: Thread**, not All. The `LocalVideoPeer` worker must be paused while the
   Android main thread continues to run the three-second deadline.
3. Set logpoints/breakpoints, also Thread-only, immediately before `createEglSurface(surface)`
   in `Attempt.start()` and in the main-thread cleanup completion immediately before
   `retiring = null`. Observe only attempt labels, object identity, ordering and monotonic
   elapsed time. Do not log offer SDP or frame pixels. A breakpoint suspending every thread
   invalidates the deadline test.

## Production reconnect and cross-view exclusion

1. Close the viewer normally. At the worker breakpoint, retain the retiring `Attempt` in
   the debugger and note `closed == true`, the view's `current == null`, and `retiring`
   pointing at this attempt. Let the main thread keep running.
2. Reopen the Computer through the app while the old worker remains held. The route keys
   native views by attempt, so this production path can create a _different_ TextureView.
   Its peer must be refused with `native-cleanup-pending`; it must never reach
   `createEglSurface` while the old worker owns `nativeSlot`. The Host must remain healthy.
3. Continue the old worker. After all release calls complete, the permit is returned once.
   Use the explicit Reconnect action. Only a new server-issued attempt may reach native
   initialization and present the moving fixture. Verify no automatic takeover and no
   stale presentation callbacks from the retired attempt.

This row verifies cross-view exclusion. It does not by itself verify same-SurfaceTexture
replacement, because the route currently remounts the native view.

## Same-surface delayed handoff and late deadline

Use the already attached native view's debugger fields to exercise the native prop contract
without adding a product debug route. This is an isolated resource-lifecycle test: local
labels `B` and `C` below are not Host-authorized grants, and their events must not be treated
as production video acceptance or sent as control commands.

1. Start another fresh authorized observation and pause the main thread in the view's
   `sync()` using a method breakpoint. In the debugger's Evaluate Expression, retain that
   `LocalComputerVideoView` as `view`; retain its `texture.surfaceTexture` identity as `S`.
   Use Kotlin evaluation against this object to assign a distinct `view.attemptId` label
   `B`, preserving the existing valid video-only offer, then call `view.sync()` on the main
   thread. This is the same sequence as a changed native prop on an existing view.
2. Let the main thread run. Hold the retiring worker at the teardown breakpoint from Set
   up. While it is held, verify that `view.current` stays null, `view.retiring` remains the
   old attempt, and no `createEglSurface(S)` call occurs for B. Repeated `view.sync()` calls
   must have the same result. Do not claim playback of B: its label is intentionally not a
   Host binding and the app must ignore its signaling/presentation callbacks.
3. For the **before-deadline** row, release the old worker before three seconds. Verify
   ordered events: all old native resources released → main-thread `retiring = null` → at
   most one initialization for B on S. No second producer may attach before old release.
   End this isolated native attempt and return to a fresh authorized observation.
4. Repeat the same setup for the **after-deadline** row, holding the worker for at least
   four seconds while the main thread runs. At the deadline inspect
   `view.suspendedAttempt == view.attemptId` (B), `view.current == null`, and the
   `native-cleanup-timeout` event. This fence must already hold before any JavaScript error
   handler runs; use a JavaScript debugger pause if needed while leaving native main active.
5. Release the worker after the deadline. Verify the old resources finish disposal and
   `retiring` clears, but B never reaches `createEglSurface(S)`. Repeated `view.sync()` and
   reapplying unchanged B props must not reopen it. Only a different attempt label C can
   request initialization after completed cleanup; a real app retry obtains C from the
   authenticated Host, never from these debugger labels.
6. Repeat with the app backgrounded while B waits for old cleanup. Completing old cleanup
   while backgrounded, and foregrounding with unchanged B, must not initialize B. Normal
   foreground observation requires a newly admitted attempt, with no restored controller.

If the debugger cannot evaluate the existing view on its UI thread, mark the same-surface
rows **untested**. Do not substitute the cross-view row or a TypeScript mock. A future
native instrumentation harness is needed to automate these object/lifecycle assertions.

## Destroyed surface and delayed successful cleanup

1. Hold the worker as above, then close the screen so `onSurfaceTextureDestroyed` runs.
   Verify the destroyed surface is retained in the old attempt's `destroyedSurface` atomic
   reference; no new producer can attach to it. Keep main running past the deadline.
2. Release the worker after four seconds. Verify `resourcesDisposed` becomes true and
   the deferred surface is claimed by `getAndSet(null)` and released once. There is no
   abandoned three-second waiter or new `LocalVideoSurfaceRelease` thread.
3. In the opposite ordering, let native cleanup finish before surface destruction. Destroy
   the surface and verify its immediate one-time release through the same atomic handoff.
   Inspect Logcat for BufferQueue/EGL errors and retain the first failure before retrying.

Finish with a fresh, unmodified production observation. Remove debugger breakpoints,
confirm normal motion/control/release/resume, and collect the canonical Host cleanup and
receiver evidence. These fault-injection rows do not establish measured FPS, latency,
physical scanout or Human acceptance.
