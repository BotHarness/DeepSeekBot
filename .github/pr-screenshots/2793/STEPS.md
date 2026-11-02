# Connection step screenshots — PR #2826

Captured from source `bac58b9d2c0a8aec2cec54c47b33435bfb6d0a81` on 2026-10-26 (Asia/Tokyo), real isolated DSH 0.2.1-rc.3 Hosts. Product screenshots: English, light theme, 1280 × 900. `c2.png` is the actual AuthKit device-connected page in the in-app browser, dark theme, its native viewport. Exact dimensions and SHA-256 values are in `steps-manifest.json`.

| Path                         | Actual UI sequence                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared entry                 | `s0` Connections → `s1` direction → `s2` method                                                                                                                                      |
| localhost / Local network    | `l1` on-demand enable → `l2` invitation → shared identity/approval sequence                                                                                                          |
| Tailscale                    | `t1` initial start/sign-in prompt → `t2` running, publication needed → `t3` explicit publication confirmation → `t4` published → `t5` invitation → shared identity/approval sequence |
| Tobs Connect                 | `c1` signed out → user completes account login → `c2` device connected → `c3` invitation → shared identity/approval sequence                                                         |
| Shared receiver and approval | `j1` link entry → `j2` full Host fingerprint → `j3` wait for exact device approval → `l3` inviting Host approves matching device → `j4` connected after Host Feed                    |

The product calls the local choice **Local network**. A phone's localhost addresses the phone itself; these captures show the existing local-access path, not a claim that a phone can reach the desktop through its own loopback address.

Each method selection was actually clicked. Invitations intentionally contain all currently ready routes; selecting a method does not pin the later connection to that transport. The identity and approval UI is shared and is captured once, not falsely presented as three independent transport-only acceptance runs. Both complete fingerprints were checked and the receiver reached the real connected state with no page errors. Native phone/network switching remains outside these desktop screenshots.

Tailscale was already installed and signed in. Its initial Host detection temporarily showed a start/sign-in prompt (`t1`); subsequent detection showed running without another login. No installation or credential entry was fabricated. Publication succeeded on HTTPS port 8443 to this test Host's local port 2173. The user explicitly authorized temporary publishing and required cleanup; `phone-route-disable --confirm` returned `published: false`, `managed.enabled: false`, `managed.owned: false` afterward.

The user completed the real Tobs Connect authentication. Credential-entry screens and private account details are deliberately omitted; the account success page and resulting invitation are included. This test Host's connection is signed out at cleanup.

Black rectangles in invitation screenshots redact the live one-time QR code. No UI state was mocked. PNG normalization changes file encoding only. Host/device public fingerprints remain visible to explain the actual identity comparison. Failed automation attempts and original captures remain in the private task evidence archive.
