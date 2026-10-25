# Connections: first LAN slice (#2793)

Captured on Windows, 2026-10-26 (Asia/Tokyo), from two task-owned isolated DSH 0.2.1-rc.3 Hosts. No production account, personal Channel, public tunnel or physical device was used.

## Source and capture conditions

- Before Client: `8f4e20cf01d8e7c25541c391a5ad09076cf9f065` (implementation parent, containing main through `dd6da4645afcd17ab1a265c293d5928952deb016`). The exact separately built Client bundle was substituted into the matching served module, using the repository's existing baseline-capture technique. This compares Client layout on the same isolated Host; it is not a claim that the old Host accepted browser LAN pairing.
- After behavior: `401a1787f`, plus the following commit's two identity-hint translations from Devices to Connections. The latter copy correction does not appear in the published screenshots. All captures are actual rendered app surfaces.
- `b.png`, `a.png`, `m.png`: 1280 × 900, English, light, same empty paired-device list. Before/after show the old entry point and unified entry; methods is a new step.
- `p.png`, `prepare.png`, `done.png`, `ui.png`: 1280 × 720, English, dark, Codex in-app browser. `p.png` is the reusable global approval modal; it never contains a QR or invitation URL. The fingerprints belong to disposable task identities.
- `c.png`: 1280 × 720, English, dark, headless Chromium, actual CLI-selected Client after Host Feed enrollment.
- `eb.png`, `ea.png`: **Expo Web layout preview**, 390 × 844, Chinese, light. The same SDK 58 export and `BOTHARNESS_MOBILE_WEB_PREVIEW=1` adapters were used before/after. Only the desktop-entry instructions changed. Browser typography, headers and icons do not establish native behavior.
- In-app browser screenshots arrived as JPEG; they were encoded as PNG without content edits. `manifest.json` records dimensions and SHA-256. Failed attempts, original captures, console/ARIA evidence and private invitations stay outside Git.

## Observed behavior

1. Devices and Connect became one Connections sidebar entry. Add connection is the primary action; Manage retains existing preparation controls.
2. Add connection distinguishes inviting a device and joining a Remote Host. Inviting shows three methods; local access off produces Enable and continue in the preparation step.
3. A real Remote Host invitation was pasted through the UI. Its full Host fingerprint matched the trusted Host. The receiving Host showed the exact full requesting-device fingerprint in Pending requests.
4. Closing and reopening Pending requests preserved the request. Approve device completed that exact enrollment. The originating Client displayed Connected and the remote `Connection QA 2793` Channel.
5. A separate CLI run explicitly selected a newly registered Client, required full fingerprint confirmation, approved the matching receipt/key and observed `saved: true`, `connected` and the same visible Channel. The page recorded zero errors.

## Verification and limits

- Direct connection regression: 8 files / 49 tests passed.
- Existing relay, RemoteHosts, Client registration and phone recovery seams: 5 files / 93 tests passed (some overlap with the direct group).
- Build, lint, typecheck (including mobile), format, CLI parity, feature map and change-fragment checks passed before publishing the evidence.
- The complete Windows suite is **not green**: the bounded-concurrency run reported timeouts in unchanged Group digest and Cloud connection tests. The first attempt was interrupted after a baseline-build dependency-sharing mistake; dependencies were restored with the unchanged lockfile before focused checks and the complete rerun. See the PR's latest status for the full-run outcome; do not infer a passing suite from these screenshots.
- No physical Android/iPhone, native desktop window, OS VPN transition, Tailscale/Connect end-to-end qualification or Human acceptance is claimed. These remain in #2793 and the shared platform QA lanes. A Web Origin contract test is not a native desktop run.
- Tailscale/Tobs Connect orchestration and Tob-initiated setup remain subsequent slices. Existing preparation controls are retained, not newly qualified here.

## Human review path

Run two isolated Hosts. On the granting Host choose Connections → Add connection → Connect a device to this Host → Local network. On the receiving Client choose Add connection → Connect to a Remote Host and paste the private invitation. Compare both complete fingerprints, open the granting Host's persistent Pending requests entry, close/reopen it, then approve the matching device. Require the receiving Client to show a known remote Channel. Repeat cancellation and expiry without creating a second pairing authority.

For the CLI path, use `connection-clients`, then `connection start/status/confirm/cancel` with the explicit target Client ID; provide the link only through a file/stdin. Follow `docs/bot-cli.md`. Do not use production invitations for screenshots.
