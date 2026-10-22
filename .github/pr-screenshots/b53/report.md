# Connect native upload repair — Simulator batch53

Matched Before: main `46bb44b2ff4f1ca9ca682ac9dce423a310c3bb2d`. After: PR #2578 `ea36821ea92904260ba3d78d21db84a3a7d60b13`, which includes that main. Existing QA iOS27 and installed dev client reused; strict native fingerprint `2ab2d67bec3a3fd2186c6ea9cf85ceadb07c4b7a`; executable SHA256 `cbf75e97a9776956bca0bcdf081a0dc5da2a6ba858d5bf4fbd26a58e3e5c62e7`. No rebuild/install/erase of native app. Each source's Host was rebuilt; JavaScript switched explicitly for comparison.

| Observed path | Result |
|---|---|
| Before: actual photo picker → Send | FAIL reproduced, Not sent; no canonical message |
| After: native DM | PASS, real direct DeepSeek CONNECT53-READY |
| After: same photo picker → Send | PASS; owning Host message contains image/png,886 bytes; decoded96×96 RGBA pixels exactly match the fixture |
| After: masked password with tunnel rejection | PASS; save refused, canonical request pending |
| After: explicit recovery | PASS; configured, native Handled and input removed |
| After: actual secret_cli gh --version approval | PASS; allowed-once, real APPROVAL53-OK, no external API command |
| After: malformed handshake response | PASS; save refused, canonical request pending |
| After: exact device key revoked | PASS; save refused, canonical request pending |

The photo picker re-encodes PNG, so its file hash differs from the imported file; decoded pixels match exactly. Downloaded bytes, MIME, length and SHA256 were checked through the owning message's authenticated Host endpoint; the native screenshot is not the sole upload evidence.

The real task Cloudflare tunnel used normal DNS/TLS and a pre-decryption origin recorder. Across the comparison,2,524 records/51 channel upgrades contained no three synthetic password markers (literal/base64), selected application markers, credential headers or plaintext fallback requests. Both deliberately sent plaintext QA probes returned404 and are counted separately. A first setup attempt returned530 before tunnel readiness; no trust or application effect was accepted. A pinned locally cached cloudflared binary then restored connectivity. The malformed-handshake check is transport refusal evidence; existing receiving-endpoint cryptographic regressions remain the source for AEAD tamper/replay claims.

First pairing on matched main compared the full Host fingerprint and approved the exact phone fingerprint without cold restart (same PID). After loading the repaired JavaScript, the admitted pairing resumed. This comparison does not claim another fresh first-pairing ceremony on After or a cold-launch-free source switch.

Actual native password form captures cover light/dark and large/accessibility-large/accessibility-extra-extra-extra-large. At maximum text size the long form extends below the initial viewport; this is not VoiceOver or a complete accessibility acceptance. The shorter revocation form exposes Save and Cancel at maximum size. Source-owned browser remote tracer, physical iPhone, Android, CJK and independent Human/security qualification are separate.

Formal deployed account enrollment subsequently passed after the Human signed in on both surfaces and explicitly authorized the relay deployment. The previous production Worker731376ea still called the legacy POST /connect/offer endpoint and safely refused the current Host; main already contained the encrypted enrollment contract. The reviewed Worker diff only changes that contract. Its17 tests and deployment dry-run passed; production versionebedbe4d-8b7c-42ce-bb68-5d8dcb630fa7 now uses it. Database, secrets and quota values were preserved.

The phone selected the task registration, compared the complete Host fingerprint against the independently authenticated local Host, and waited for approval of its exact phone key. After approval it immediately loaded native Settings through the managed Cloudflare hostname; owning Host reported connect-noise-xk-v1 / encrypted. PID4008 was unchanged across the failed predeployment attempt, fingerprint verification, approval and successful use: no cold restart. Screenshots account-host.png, account-phone.png and account-connected.png capture this ceremony; no account email or credential is published.

The native DM/image/password/failure capture above belongs to the dedicated instrumented real Cloudflare tunnel. The formal managed-account test separately proves enrollment and subsequent encrypted Settings access; it is not claimed as a second instrumented password capture. #2578 has full CI39739723972 and CodeRabbit success; the Human separately authorized merge, completed as4de4982443d501af9b68372848bc7fec36f7d7c4. #2542 acceptance is complete with the explicitly listed coverage limits. No app release or physical/Android/assistive-tech acceptance is implied.

Cleanup: both task keys revoked; temporary manual and account-managed Host/tunnels/DNS removed with absence verified; synthetic credential revoked and Bot deleted with memory retained. Only the imported checker photo was removed;10 originals remain. Original My Mac, light/large and signed-out mobile Connect session restored. Own Host/Metro/recorder stopped and all five reserved ports clear; driver session closed. Existing Simulator, installed binary, other Hosts and physical device preserved. Batch53 lease RELEASED.
