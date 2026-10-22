# Connect main Simulator batch 52 — partial acceptance

Source: `55e0ce95200faf2cfc9a20ec4d41acc24be15c9a` (main). Existing QA iOS 27 Simulator and installed development client reused; no native rebuild, install, erase or additional device. Native fingerprint: `2ab2d67bec3a3fd2186c6ea9cf85ceadb07c4b7a`; executable SHA256: `cbf75e97a9776956bca0bcdf081a0dc5da2a6ba858d5bf4fbd26a58e3e5c62e7`.

| Actual native path | Result |
|---|---|
| Full Host fingerprint comparison + exact phone-key approval | PASS; same application PID before/after, no cold restart |
| Immediate navigation and real direct-DeepSeek DM | PASS; canonical handled delivery and visible CONNECT52-READY |
| Masked private input, tunnel HTTP502 | PASS; refusal, Host request stays pending |
| Explicit recovery and Save privately | PASS; Host configured, native Handled, input removed |
| Real gh --version tool approval with synthetic credential | PASS; allowed-once and actual reply |
| Malformed handshake response | PASS; refusal, request pending, explicit cancellation succeeds |
| Exact approved device revoked | PASS; refusal, request pending |
| Native photo upload | FAIL; RN Blob lacks arrayBuffer(); repair PR #2578 awaits native recheck |

A task-owned real Cloudflare tunnel used ordinary DNS/TLS. The loopback origin recorder observed traffic before endpoint decryption: 3,240 records / 82 upgrades, all channel upgrades at the fixed encrypted endpoint without credential headers. Three synthetic secret markers (literal/base64) and selected application markers were absent. The plaintext fallback trap received **zero** requests. One deliberately sent QA plaintext probe returned404; it was not an application fallback. This bounded observation is not an external cryptographic audit.

Screenshots are actual captures of the synthetic QA fixture. Failed inputs remain masked for retry; only successful submission clears the field. The native pairing title currently says Use Tailscale even for this locally issued Connect offer; do not treat that as deployed account-enrollment evidence. The existing first-use notice was already dismissed. Conversation-row AX discovery was unavailable; the production DM deep link was used. Default text size (large) only; light/dark captures are not a complete font-size matrix.

Not run in this batch: deployed account enrollment, integrated source-Host Web tracer, Android, physical iPhone, VoiceOver, CJK qualification, independent Human/security acceptance. #2542 remains open. Follow-up #2578 integrated candidate ea36821ea92904260ba3d78d21db84a3a7d60b13 is not represented by these screenshots.

Cleanup complete: task credential/device keys revoked, Connect disabled, temporary tunnel/DNS removed with absence checks, synthetic Bot deletion completed; only own Host/Metro/recorder stopped. Own imported photo removed, all10 original photos preserved; original My Mac retained/selected, light/default-large restored. Dev app/driver closed; existing Simulator/native products/physical phone preserved. Lease RELEASED. Private tokens, profile files and captures are not published.
