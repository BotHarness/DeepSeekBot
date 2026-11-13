# Desktop report capture integration

Status: Client integration and companion Desktop source patch implemented; a composed Windows RC1 development candidate passed the report screenshot journey. This remains an unreleased DSH capability and is not installed into the Human's existing Desktop.

## Existing behavior and scope

The previous Windows Tobs 1.7.0 investigation observed over 22 seconds of screenshot busy state. Its desktop path called `modern-screenshot` on `document.body`. The 15-second library option is a resource timeout, not a total capture budget. That observation does not identify how much time was DOM traversal versus resource embedding.

The product owns the report, capture toolbar, markup and attachments. DSH Desktop owns the Electron window, preload and IPC authority. A Host Plugin cannot acquire Electron's `BrowserWindow` through the Node Host process. The screenshot therefore crosses only the existing Desktop preload seam; it introduces no Host route, Host bridge method, Bot tool or persistence.

## Companion Desktop source change

[`patches/dsh-desktop-window-capture.patch`](patches/dsh-desktop-window-capture.patch) adds `dshDesktop.captureWindow()` under preload protocol 1. It returns `{ bytes: Uint8Array, mediaType: 'image/png' }`. This is a proposed, application-defined extension until upstream accepts and releases it. Merely updating the Tobs npm package cannot add it to older Desktop executables.

The patch targets DSH `dsh-v0.2.2-rc.1`, revision `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`, matching this product's pinned runtime. Exact Git blob identities:

| Source                            | Git blob                                   |
| --------------------------------- | ------------------------------------------ |
| `apps/desktop/src/ipc.ts`         | `a3c5f5d9352440bf67e40cdb07dde15a57712d3b` |
| `apps/desktop/src/preload-app.ts` | `26266b4f1c8a497c3cc5c94d19a06a4b5ee3bf49` |
| `apps/desktop/src/main.ts`        | `d8d0e30c4c73d6c2e839de60d1b6c04708457c61` |

Review and apply the patch to a matching DSH source checkout, then use upstream's Desktop build process to produce a candidate. A different upstream revision requires rebase and requalification. Do not alter an installed ASAR, inject a bridge into a user's renderer, or use a debugging screenshot as the production provider.

The main process uses its existing `assertMainApplication` authority, then checks the exact top frame, application URL and visible, live owner window. It accepts no renderer-provided selector, bounds, path or URL. `webContents.capturePage()` returns current viewport pixels without screen sharing or filesystem writes. It rejects empty/oversized images, hidden/minimized/destroyed windows, concurrent capture and owner/navigation changes. A 2.5-second timeout returns a refusal while retaining the busy lease until Chromium's original capture settles. Shutdown unregisters the handler and invalidates pending results. Pixels remain transient until the Human adds the image to the existing report attachments.

## Client selection and lifecycle

The Client prefers the optional native capability only when `protocolVersion === 1` and `captureWindow` is callable. Older Desktop versions retain page capture; browsers retain their existing screen-share/page behavior. Once native capture is selected, refusal, malformed PNG or a three-second timeout stays an error in the current capture toolbar. There is no automatic DOM retry. Stopping the session invalidates a late result. The toolbar hides during native capture, with the existing two-animation-frame paint boundary before requesting pixels; markup and attachment names remain unchanged.

## Verification

- Client capture tests cover native selection, filename/type/size, refusals, bad PNG, size limit, timeout and stop; legacy/browser tests remain.
- The report dialog test runs the same capture → markup → attachment → reopen → discard → Done journey with both page and native providers. The native test asserts that the toolbar is hidden when pixels are requested. These are component tests with a provider substitute, not runtime proof.
- `scripts/test/dsh-window-capture.test.mjs` extracts and executes the actual new source in the patch, exercising owner checks, hidden/minimized windows, navigation/disposal, concurrency, timeout and cleanup. The test does not use Electron.
- Patch applicability is checked against the three exact upstream source blobs above. The matching source candidate also passed the eight artifact build gates, including Host and Desktop compilation/bundling, Client compilation/bundling and Web build. This is an unpackaged development candidate, not a signed installer.

## Native verification path

1. Build a DSH Desktop candidate containing the source patch. Launch an isolated Profile with the changed Tobs Client; keep the Human's installed Desktop and Profile untouched.
2. In Bot mode, open Report a problem from the diagnostic/bug entry, choose Screenshot and markup, scroll to a representative conversation, then click Screenshot. Confirm the actual window pixels appear in markup and exclude the toolbar. Record click and first visible markup timestamps; target below one second, report all attempts and machine/display conditions.
3. Add the screenshot, reopen its thumbnail, mark it, cancel/retry a screenshot and finish the session. Confirm report attachment content and filename. Do not submit a report or publish private pixels.
4. Repeat light/dark, normal/high DPI and a page containing guest/video content. Check visible guest content separately: `capturePage` of the application webContents is not proof of child WebContents compositing. Record any unsupported content rather than claiming whole-window equivalence.
5. Exercise navigation, window close/hide and a capture failure. Confirm no late image enters another session, no stuck toolbar, no overlapping capture after timeout and no slow DOM fallback.
6. Preserve screenshots, accessibility state and console evidence under this task's verification directory. Unit tests and patch applicability cannot clear this native gate.

## Local check results

On 2026-11-13, the four focused files (Client capture, report dialog, native patch behavior and CI selection) passed all 77 tests. Core workspace TypeScript, full product build, touched-file formatting, patch applicability and CI-plan checks passed. The release-ledger, ADR-number, CLI-parity and feature-map checks also passed. Targeted lint found no errors. The navigation regression was first observed failing, then fixed: every main-frame navigation invalidates pending pixels, including a same-URL reload and same-document navigation; its listener is removed when Chromium settles.

The full suite was attempted and stopped after failures across other areas, including push delivery, Bot schedules, phone registration and Git-backed operations. Its log remains at `.humanlayer/native-capture-full-tests.log`. No clean baseline comparison was run, so those failures are not classified as pre-existing regressions. The full suite did not pass.

### Composed Windows candidate

The final candidate used the patched RC1 Desktop source, its matching Host, the full local Tobs build and a fresh isolated Profile. No model call or credential was needed. The main window was entered through Welcome → Add API Key → Configure later; screenshot checks against an unshown application window are invalid performance samples.

The actual Bot mode → Report a problem → Screenshot and markup → Screenshot path produced the following click-to-ready measurements. Readiness required a visible canvas at full image dimensions, an enabled Add to attachments button, and two subsequent animation frames. Measurements include automation dispatch and paint waiting, not just IPC duration.

| Scenario                                          | Click to ready (ms) |
| ------------------------------------------------- | ------------------- |
| First light capture                               | 297.8               |
| Discard and retry 1                               | 178.3               |
| Discard and retry 2                               | 172.2               |
| Discard and retry 3                               | 160.5               |
| Discard and retry 4                               | 135.8               |
| Capture after reopening and editing an attachment | 225.4               |
| Dark theme                                        | 276.3               |

Conditions: Windows x64, Electron 44.7.0, viewport 1282 × 823 CSS pixels, renderer device-pixel ratio approximately 1.14, PNG 1462 × 938 pixels. The default Bot's local DM was open; these are not measurements of a populated large conversation or other display densities. All seven successful final-candidate attempts are listed, and all were below one second. Screenshots and raw captured pixels were inspected in both themes; the capture toolbar was absent.

The journey also drew a pen stroke, added a note, attached the image, reopened it with its stroke and note intact, discarded a subsequent capture and returned to the report with exactly one attachment. Exporting that attachment produced a valid 169,827-byte PNG with the expected filename and dimensions, SHA-256 `1c7c57c7caf39fb3ac651410cc97d4ae7fa44262784a31cb6a0327cb81b12d86`. No report was submitted. The action batches recorded no renderer page errors. Local ARIA snapshots, screenshots, raw pixels, exported attachment and measurements remain under `.humanlayer/native-capture-qa-rc1/evidence/`.

An earlier RC3 candidate exposed a product/Host compatibility failure (`root` service access during bridge initialization). It is preserved separately under `.humanlayer/native-capture-qa/` and is not substituted for final RC1 acceptance. A minimized-window runtime probe was unavailable because Electron does not implement CDP `Browser.getWindowForTarget`; a native-control attempt timed out at app approval. Hidden/minimized refusal, navigation, timeout and concurrency remain source-executing regression coverage rather than claimed live negative-case evidence.

Additional display densities, independently composited guest/video content, large populated conversations and live navigation/shutdown races remain release qualification work. Capturing the main application webContents does not establish whole-window equivalence for independent guest views.

Standards and Spec code review found and corrected registration before the main-application authority's initialization, missing CI coverage for the executable patch input, and CRLF-sensitive patch parsing. Both review axes confirmed these corrections.

## Delivery boundary

The Client and executable upstream patch are delivered together in [PR #4106](https://github.com/BotHarness/DeepSeekBot/pull/4106). The source candidate was built without modifying an installed ASAR or injecting a renderer bridge. Existing Desktop releases still lack the capability: updating only the Tobs npm package retains their page-capture path. Upstream integration, a distributed Desktop release and the broader release matrix above are separate from the verified local implementation. No release was created by this task.
