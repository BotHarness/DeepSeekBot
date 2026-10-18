# Cloud channel HTTP UAT — 2026-10-18 JST

Final mobile runtime: `5d2ef0fe8a13654a75779ea0320394b13c00764c`. Compatible signed native build: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`. Service runtime: `b26150224a60808d89daf7e9cd8863faf26ed75f`, UAT Worker version `f62d1003-7e9c-4924-a889-d06a27ec0427`, D1/Org/Channel schemas 4/3/1.

Shared iPhone 17 Pro / iOS 26 Simulator only, English, 402×874 captures. No build, erase, physical phone, Host, Prod or merge action. Authentication uses an API-prepared synthetic ordinary-user session and the existing trusted configuration; this is not another Hosted AuthKit/PKCE or email-delivery test.

## Observed behavior

- CLI creates `general` and `research`, replays identical create/send operations without duplicate records, and reads durable history. The other user cannot read these channels, including by putting their IDs under the wrong organization URL.
- Actual phone UI creates `mobile-test`; independent formal CLI sees the exact organization/channel. Phone sends, CLI reads and replies, phone reloads the reply. The final CLI readback matches all seven message bodies, newlines and ordered sequences 1–7. Repeated identical text in sequences 6 and 7 is two deliberate sends with different operation keys, not a replay duplicate.
- Phone also creates `large-type` at maximum Dynamic Type. A's selected workspace now has four channels; B's has zero. A has three workspaces and B has one.
- Temporarily changing synthetic A's current WorkOS membership from owner to member makes a stale-owner-token channel creation fail with 403. Listing, reading and sending remain allowed. The operator restored and verified owner before native testing. No Human administrator role changed.
- Cold restart retains the saved session/selected workspace; server checks and refresh retain the verified ordinary-user role. Sign out revokes the phone session, rejects its latest refresh, removes local persisted/in-memory credentials, and retains configuration. Independent A and B CLI calls still work. The temporary phone credential file was removed after verification.
- The final six-case matrix covers standard (`large`), intermediate (`accessibility-medium`) and maximum (`accessibility-extra-extra-extra-large`) × light/dark. Live resizing retains the exact multiline draft and focus. At final maximum/dark, the complete Send button bottom is 521pt and the predictive keyboard begins at 529pt; the actual tap commits sequence 7. Native keyboard frames, not delayed scrolling, drive the list.

## Captures and provenance

- `before-workspace-entry.png` is the same selected workspace before the new channel entry, from the prior onboarding slice (`9f71dd3d9`). `01-workspace-entry.png` adds the entry at `7ceab0d27`.
- `03-three-channels.png` and `06-cli-reply.png` show the first HTTP path at `7ceab0d27`. `26-four-channels.png` is the later four-channel list at `f4dd6dc2f`.
- `11-maximum-keyboard-light.png` preserves the original covered caret/action failure. `19-fixed-max-dark.png` and `24-create-max-dark.png` preserve the later dark-input contrast failure; despite their working filenames, they are NOT final passing evidence.
- `27-contrast-create-dark.png` / `28-contrast-create-light.png` show themed creation input at `6704326e9`. No channel was created from that `contrast-check` draft; it was discarded on restart.
- `final-*.png`, `29-final-restart-session.png` and `30-signed-out.png` are final `5d2ef0fe8` evidence. The final composer matrix uses the same multiline draft in every case. Compared with the first failure, draft text and scroll/caret position differ; the corrected draft is longer and includes an explicit newline. These are a native behavioral comparison, not pixel-matched typography benchmarks.
- Recordings preserve real timing, including idle/tool pauses. Published copies use 12fps H.264 review encoding with unchanged chronology; originals remain local. `recordings.json` gives each duration/size. Preview sheets sample frames and are not extra test executions. `first-run.mp4` captures `7ceab0d27`; `keyboard-and-fonts.mp4` captures `f4dd6dc2f`. `final-session.mp4` spans the `6704326e9` contrast check and subsequent `5d2ef0fe8` short-label fix, final matrix, send, restart and sign-out; do not attribute its entire duration to the final head.

## Retained failures and proof limits

The first UAT CLI attempt failed during JWKS lookup before writes; replaying the same keys passed. Initial native keyboard handling covered the caret at maximum text size. Reusing the existing keyboard-form adapter fixed focus reveal; two-line action spacing and a concise Send label keep the full action above the predictive bar. Explicit theme foreground/placeholder colors fix black text in dark mode.

The first repair recheck still used old JS because Metro was started with CI mode and file watching disabled. `stale-metro-recheck.mp4` is harness failure evidence, not proof of the repaired head. The runner restarted only its own Metro, then repeated on the loaded candidate. Two attempts to replace an existing long draft produced driver readback mismatches; that unsent draft was discarded through the UI. Fresh-field input and final exact server readback passed. One appearance transition screenshot was not used as final evidence. Formatting failures and fixes remain in CI history.

Source checks: 30 workerd service tests, 23 Node/CLI/contracts, mobile 20 focused client/style tests, typechecks and applicable CI. Evidence does not establish Android native behavior, physical-device or Human visual acceptance, screen-reader/IME qualification, WebSocket delivery, invitations, Agents, history grants/rejoin, or cross-Host work. Current HTTP membership checks do not close the outstanding T1 provider-event/session-revocation gates. T1/T2 remain open.

Light appearance and large text size were restored. The driver, app and owned Metro were stopped; shared original files/data/native rollback and other lanes were preserved. The UAT synthetic identities, four workspaces, four channels and independent CLI sessions remain for the next goal slice.
