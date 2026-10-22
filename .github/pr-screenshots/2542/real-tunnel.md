# Real Cloudflare verification — PR #2547

Candidate: `683b0cbe9c0f158e80929601f59a312ff5f9c4bf`, stacked on #2546 `b842d3ce0750b5085106defef21c4d4eb0112f81`. No merge or deployment of the product relay.

## Environment and observation

A dedicated temporary named Cloudflare tunnel and proxied DNS record were created using the repository's Cloudflare API adapter. Normal public DNS and TLS were used, with a Cloudflare edge response confirmed. There was no hosts-file, DNS or client URL mapping. The real cloudflared executable was started by the owning Connect module on the isolated DSH 0.2.1-rc.2 Host. Ingress remained limited to `/botharness-device/*`; other paths returned404.

An instrumented local forwarding hop between cloudflared and the owning device gateway captured outer request headers/URLs and both directions of WebSocket frames, before application decryption. It did not receive the Noise keys. Controlled rejection, blackhole and tampering modes exercised failures. A second saved loopback route terminated at a counting trap. Private captures and infrastructure identities remain machine-local; only aggregate results are publishable.

This verifies the tunnel and application encryption path. It does not verify deployed account enrollment/WorkOS discovery, Android, physical-device acceptance, Human QA or external cryptographic audit.

## Passed

- Real tunnel pairing compared the pinned Host fingerprint and explicitly approved the exact device public key.
- Synthetic private input reached canonical `configured` state through the actual private-input RPC. Notification settings also traversed the encrypted gateway.
- Connection rejection, handshake timeout, tampered traffic, wrong Host key and missing Host key all refused. The private request remained pending; no raw carrier request or fallback-trap request occurred. Explicit recovery succeeded.
- Revoking a paired device prevented further private submission and prevented the outer notification callback from switching routes.
- Web UI loaded from a trusted local Host: actual masked password form, failed submission displayed the error, canonical state remained pending, explicit state check/retry succeeded, visible Submitted matched canonical configured, and the field was removed. Zero page errors. Before/error/success images were inspected.
- Outer captures contained no synthetic password, base64 password, device credential, private-input method name, authorization header, cookie or WebSocket subprotocol credential. Channel upgrades used only the fixed channel path. No fallback-trap requests.

## iOS

Current source `683b0cbe9c0f158e80929601f59a312ff5f9c4bf` was rebuilt as a Debug development app (Expo58.0.17 / RN0.88.0) and driven on the existing QA iOS27. No new Simulator or erase; existing store app and physical XS Max were untouched.

Host and device fingerprints were independently compared before exact-key approval. Pairing persisted in native Keychain and reconnected after cold restart. The required secure text field disabled submission while empty; the real keyboard showed masked input and a reachable save control. Tunnel rejection produced a visible error and canonical pending state, with zero fallback requests. After explicit refresh/retry, Save privately reached canonical configured and visible Handled; the input was removed. The final capture contains1466 entries /39 upgrades, no synthetic secret or credential headers, and zero fallback-trap requests.

**Native acceptance remains open:** first pairing triggered `[RNScreens] sheetPresentationController is null when attempting to set allowed detents`, followed by blocked taps. A cold restart restored interaction and retained the pairing. The cause and regression scope are unresolved; the password-path success does not close this UI issue. `cf-ios-sheet.png` records it. This is not a clean full native QA pass.

Build correction: the initial `CODE_SIGNING_ALLOWED=NO` binary lacked Keychain entitlements and refused to save pairing. Xcode's normal simulator signing build fixed this local build configuration. No source workaround or weaker credential storage was introduced. Manual ad-hoc signing was unsuccessful and was replaced by the successful Xcode build. Download-cache cleanup was authorized; source, installed dependencies, evidence, build products and existing devices were preserved.

## Driver corrections

Initial evidence scripts encountered a leading-dash one-time receipt requiring the CLI `--` separator, a superseded old private account, a non-existent pending-key fingerprint property, and the UI's exact Retry check accessible label. They were corrected against current contracts. These attempts were not counted as passing feature verification. Browser failure records and Host observations remain local.
