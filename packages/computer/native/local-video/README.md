# Windows Local Computer media helper

This application-defined helper belongs to the Computer Plugin/Fiber. The Host
supervisor starts one separate Electron process per authorized viewer attempt.
Electron, Chromium capture, the encoder and the WebRTC peer never load into the
DSH Host process. The helper has no pairing directory, pause state or input API.

The existing explicit Local Computer start/install path downloads the official
Electron **44.9.3 Windows x64** archive. The pinned SHA-256 is
`41a1ffa0541cb0f2c9b9fe920dd2cef1793ad0ea2ada1a9582958880f4d1b23c`, obtained
from the release's `SHASUMS256.txt`. The actual archive is **158,508,870 bytes
(151.2 MiB)**. Extraction retains Electron's `LICENSE` and
`LICENSES.chromium.html`; these must travel with the runtime. A manifest records
each extracted file's SHA-256 after the archive verifies, and startup rechecks
every file. This catches missing/corrupted installations; the machine-local
manifest, like installed Host JavaScript, is not a boundary against a user able
to rewrite that user's executable files. No npm media dependency or system-wide
installation is required.

Download is capped at 256 MiB and 120 seconds. Extraction uses the existing
Computer runner with a 60-second deadline, cancellation and 64 KiB output cap.
Explicit setup also compiles the packaged `launcher.cs` with the Windows x64
.NET Framework compiler at `Microsoft.NET/Framework64/v4.0.30319/csc.exe`.
It invokes that executable directly with structured arguments, no compiler
server, PowerShell, execution-policy override or additional SDK installation.
Compilation has the same 60-second/cancellation/output limits. A missing or
blocked compiler fails setup clearly. The staged installation records the
launcher source SHA-256, compiler SHA-256 and resulting binary SHA-256; changed
packaged launcher source invalidates the install receipt. Viewing never compiles.

The sandboxed, isolated renderer loads only these packaged local assets. It
captures the primary display using Electron's display-capture handler and
Chromium `getDisplayMedia`, with audio disabled. Capture geometry must equal
the primary display's native pixel dimensions (DIP dimensions × display scale);
other origins and mismatched geometry refuse instead of changing input mapping.
Display metric changes stop the attempt. No remote pages, navigation, child
windows, camera, microphone, clipboard or debugging port are enabled.

One `sendonly` WebRTC **VP8 video track** carries the screen. ICE servers are
explicitly empty. SDP is gathered before returning the offer; the authenticated
Host command returns the Android answer. There are no data channels, HTTP video,
JPEG/PNG polling, screenshots or fallback pictures. The native Chromium sender
chooses its encoder implementation; `encoderImplementation`, actual encoded
frames and bytes sent are reported as bounded diagnostics. Hardware encoding
is not promised. The requested rate is 30 fps, with a 4 Mbit/s maximum bitrate.

A canvas copy requests real video frames at 30 Hz even for an unchanged desktop.
This avoids classifying normal desktop-capture frame suppression as a receiver
stall. It incurs GPU/CPU copy overhead and does not establish delivered frame
rate. Source-track liveness, independent source-frame callbacks, encoded frame progression and Android presentation
must all qualify the stream. Sender liveness thresholds are 2 seconds for the
source callback and 4 seconds for encoded progression; the Computer owner
also applies its independent receiver-presentation deadline. These counters do
not prove pixel freshness if a platform capture bug returns frozen content as
new source frames. Canvas duplicates never renew source liveness. A post-selection
minimum capture rate of 1 fps is requested; if Chromium suppresses source callbacks
on an unchanged display despite that constraint, the rig fails static-screen
acceptance rather than treating the duplication timer as capture evidence.

The helper's newline-delimited stdio protocol contains only control/signaling
and bounded status. Each message is at most 128 KiB, SDP at most 96 KiB, one
helper operation executes at a time, the supervisor caps pending requests at
four, and every request has a 9-second timeout. Health checks run at most once
per second after the previous check completes. Closing, revocation, cancellation
and stdin EOF stop the entire task-owned Windows Job. The separate launcher
creates an unnamed, non-inheritable Job with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`,
creates Electron **suspended**, assigns it to the Job, and only then resumes it.
An explicit inherited-handle list contains only Electron's three stdio handles;
the Job handle and retained Host process handle cannot pass to descendants.
No breakaway flag is enabled. Failed assignment/resume terminates and waits for
the exact suspended process. Root death, Host process death and Host stdin EOF
all cause the launcher to terminate the retained Job and query its active
process count for up to 1.8 seconds. Chromium descendants remain in that Job
even after Electron's root exits.

Each launcher lifetime has a fresh Host-generated nonce. The launcher wraps
Electron messages as escaped data, so Electron cannot impersonate the separate
`tree-owned`/`tree-closed` messages. The supervisor accepts cleanup only after a
matching `tree-closed` receipt reports zero active Job processes **and** the
launcher's stdio closes. Its total exit wait is 2.6 seconds. If the launcher
hangs, the supervisor terminates that exact process; closing its last Job handle
causes kernel teardown. If the launcher crashes, the same kernel rule applies.
Without a valid zero-process receipt these paths remain **cleanup unproven**,
return a refusal and poison further media admission until Host restart. An exit
event, process name, stale PID or helper-supplied claim is never cleanup proof.
No cleanup path reopens Bot execution.

## Source provenance and qualification

Primary documentation consulted 2026-10-22:

- [Electron desktop capture](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Display-media admission](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts)
- [Sandboxed BrowserWindow configuration](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron manual distribution](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
- [Pinned release and license assets](https://github.com/electron/electron/releases/tag/v44.9.3)
- [WebRTC sender codec preferences](https://www.w3.org/TR/webrtc/#dom-rtcrtptransceiver-setcodecpreferences)
- [Canvas video capture](https://www.w3.org/TR/mediacapture-fromelement/#html-canvas-element-media-capture-extensions)
- [Windows Job Objects and child inheritance](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- [Suspended process creation and handle inheritance](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw)
- [Job limits](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-setinformationjobobject)

Source implementation is not runtime qualification. Windows archive install,
Electron sandbox/capture startup, Windows scaling, encoder implementation,
extracted footprint, Android VP8 presentation, ≥15 presented fps under motion,
input-to-visible p95 ≤500 ms, static text readability and actual cessation of
media after revoke remain testing-center acceptance gates. No package download,
native runtime, Host, device or heavy check was run while writing this helper.

## Testing-center process-tree census journey

Run only in the assigned Windows/physical-Android batch, with the exact committed
Host/helper source and APK recorded. Native compilation, nested Job compatibility
with Chromium's sandbox and all scenarios below are currently unrun.

1. Establish moving desktop video on the phone. From the task's structured
   `media-tree-owned` diagnostic record retain the exact launcher PID and Electron
   root PID. Use `Get-CimInstance Win32_Process` to retain their creation times,
   executable paths and descendants by parent PID. Keep these details private;
   published evidence includes roles/counts and redacted identifiers. Record a
   baseline and confirm unrelated Hosts are excluded.
2. Independently exercise normal viewer close, device revocation and owning
   Fiber/runtime disposal. For each case retain receiver presentation cessation,
   the matching zero-process Job receipt, launcher pipe close and disappearance
   of all recorded task-owned processes. Successful signaling/CLI status is
   insufficient. Reopen only after cleanup succeeds; observe-only remains default.
3. Re-establish video, recheck the task's root executable path **and creation
   time**, then `Stop-Process -Id <that-exact-Electron-root-PID> -Force`. Its
   launcher must drain the retained Job, including renderer/GPU descendants;
   the phone stops receiving and the Host remains alive with Bots paused. A
   root-PID-only census does not pass this case.
4. In the same controlled fixture, the testing-center fault injector suspends
   only the recorded renderer process (never the Host or shared desktop). Close,
   revoke and dispose in separate attempts. Each must terminate the Job, including
   that suspended child, within the declared bound. Retain the first failure;
   the injector's finally cleanup targets only its recorded process identity.
5. Re-establish video, recheck identity, then terminate only the launcher PID.
   Verify kernel Job teardown and receiver stop. The Host must report cleanup
   unproven, publish no successful cleaned state and refuse new media admission.
   Restart only this task's isolated Host to recover; do not make a second runner.
6. Re-establish video, record exact isolated Host process identity, then terminate
   only that Host. The launcher's retained Host handle/stdio EOF must trigger Job
   drain; phone media and all owned descendants stop. On restarting the same
   profile, durable Bot pause remains and no control grant returns.
7. Exercise cancellation during suspended launch and injected assignment/resume
   failures through the testing-center launcher fixture. No suspended root,
   descendant or Job handle may survive; failures never advertise helper readiness.

The mocked supervisor tests cover receipt provenance, abnormal-exit admission
fencing and bounded cleanup decisions. They do not qualify the Win32 Job API,
C# compilation, OS process census or actual receiver media cessation.
