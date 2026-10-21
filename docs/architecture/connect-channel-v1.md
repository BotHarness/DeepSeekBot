# Connect Channel v1

Implementation contract for [ADR-0244](../adr/0244-connect-encrypts-device-traffic-against-pinned-host-keys.md). This is an application-defined adapter into the existing Device Gateway and DSH API Gateway, not another native API dispatcher. Qualification remains in progress in #2542.

## Identity and handshake

The only outer application endpoint is `/botharness-device/channel`. HTTP GET returns public Host identity and protocol metadata; it grants no authority and never replaces an existing pin. WebSocket uses no bearer header, cookie, query, subprotocol, or compression. An outer request to a legacy application endpoint is refused.

The profile is exactly `Noise_XK_25519_ChaChaPoly_SHA256`, Noise revision 34. The three XK handshake payloads are empty. The UTF-8 prologue is the JSON array `["connect-noise-xk-v1","Noise_XK_25519_ChaChaPoly_SHA256",hostId,"connect"]`, without whitespace. The responder static key is the Noise pre-message; both static keys are bound into the completed transcript. An `h` followed by lowercase hexadecimal encodes each handshake message. Their decoded lengths are exactly 48, 48 and 64 bytes. Every connection generates a fresh ephemeral key from a cryptographically secure random source; no insecure fallback exists.

The initiator pins the full 32-byte Host key after comparing SHA-256 of that key with an independently trusted Host display. Device keys are generated on the device. The existing Device Pairing authority binds the offer, verifier/account binding where present, expiry, requesting key and trusted owner's approval. A pairing session can only propose and redeem that exact key. A normal session then supplies its device credential inside ciphertext and must match the approved key in the durable `paired_devices.public_key` field. There is no authority based solely on successful key exchange or relay account membership.

Host private keys reside in the DSH Credentials Provider. Phone keys and pins are saved atomically with credentials through the existing SecureStore adapter; browser keys use the trusted serving Host's origin-local storage and do not claim hardware protection. A malformed stored Host key fails closed rather than rotating itself.

## Authenticated frames

After Split, `d` plus lowercase hex carries a 15-byte header followed by ChaCha20-Poly1305 ciphertext. The header is:

| Offset | Bytes | Value                                                   |
| ------ | ----- | ------------------------------------------------------- |
| 0      | 1     | version = 1                                             |
| 1      | 1     | frame kind = 1 (application fragment)                   |
| 2      | 1     | direction: 0 initiator→responder; 1 responder→initiator |
| 3      | 8     | frame counter, unsigned little-endian                   |
| 11     | 4     | ciphertext length, unsigned big-endian                  |

AEAD associated data is the concatenation of UTF-8 `connect-noise-xk-v1/frame`, the 32-byte completed Noise handshake hash, and the exact header. Each direction has its own Split key and starts its counter at zero. Noise's nonce is four zero bytes followed by its 64-bit little-endian cipher counter. Header and cipher counters advance together. Reject any counter other than the next expected one and close at 2³² frames, well before Noise nonce exhaustion. Any malformed header, authentication error, direction mismatch, replay, gap or cross-session frame closes and erases the session. No decoder tries plaintext afterward.

Plaintext begins with one fragment byte: 0 complete, 1 first, 2 middle, 3 last; at most 32 KiB follows. First and middle fragments must carry exactly 32 KiB; last fragments must be nonempty, bounding the fragment count as well as byte size. Fragments cannot interleave; middle/last require an active message, first/complete require none. Reassembly is limited to 8 MiB and validated UTF-8 JSON. HTTP bodies and logical stream messages are further limited to 4 MiB; binary bodies use base64 within encrypted JSON. Length checks precede large allocations. The enclosing WebSocket is ordered and reliable; a reconnect creates fresh keys and does not replay application mutations.

## Application messages and lifecycle

Only after key-bound admission does the channel accept request/cancel and logical socket open/send/close messages. All paths, arguments, attachment names and content, inner authorization, responses and mux frames are encrypted. HTTP forwarding remains loopback-only through the existing Device Gateway with its ordinary credential checks. Logical sockets are restricted to `remote.mux`; viewer signaling is unavailable on Connect until separately qualified.

Each session allows at most 32 concurrent HTTP requests and four mux sockets; Host admission is bounded to 32 channels. Handshake and upstream connection deadlines are 10 seconds. Queued output is bounded, compression is disabled, cancellation aborts upstream work, and revocation or Plugin/Fiber disposal closes every associated channel. JavaScript memory erasure is best-effort and cannot guarantee removal of strings or garbage-collected copies.

## Implementation evidence

Pinned primitives: `@noble/curves`, `@noble/ciphers`, and `@noble/hashes` 2.4.0. The fixed XK state machine is BotHarness-owned; these dependencies are primitives, not a third-party Noise state machine or an audit of this integration.

The independent fixture is Cacophony `vectors/cacophony.txt` at commit `8ee9d41e34a1a596cfa3ab12aa4069ff87dc1247`, selected by exact protocol name. Tests compare all three handshake flights, the final transcript hash, and both transport directions byte-for-byte. The generic primitive seam accepts the vector's nonempty payloads; the production Connect adapter rejects all nonempty handshake payloads. This evidence does not replace adversarial integration tests, independent review, real runtime capture or native/Human acceptance.

## Account enrollment

The account relay fetches only public channel metadata. Its signed enrollment body binds relay Host id, account, verifier hash, name and issue time. The phone keeps the verifier locally and sends the signed body, signature and verifier only inside Noise. The Host verifies the current account link and freshness, creates a local offer, binds the exact requesting static key, and waits for owner confirmation. The relay never receives the redeemable offer or resulting device bearer. Unknown outcomes are not automatically replayed as new mutations.
