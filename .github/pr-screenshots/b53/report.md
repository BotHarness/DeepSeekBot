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

Deployed account enrollment is still pending an interactive account login; the browser had no existing session. Local invitation pairing through a real Cloudflare tunnel is not account-enrollment evidence. #2542 remains open. #2578 has full CI39739723972 success; no merge, release or deployment is implied.
