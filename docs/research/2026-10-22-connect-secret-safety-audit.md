# Connect secret safety: gateway admission audit

Date: 2026-10-22. Issues: [#2541](https://github.com/BotHarness/DeepSeekBot/issues/2541), [#2542](https://github.com/BotHarness/DeepSeekBot/issues/2542). Requested by Vain.

## Scope and result

Track A prevents supported clients from submitting known secret-bearing methods over Connect and refuses those methods at the Host gateway. It is an interim restriction, not end-to-end encryption or a guarantee that arbitrary chat, files, viewer input, existing device credentials or returned data contain no secrets. A modified client can still transmit plaintext to Cloudflare before the Host refuses it. Track B remains proposed in [ADR-0244](../adr/0244-connect-encrypts-device-traffic-against-pinned-host-keys.md).

Vain requires removal of the phone's full Host WebView on all routes. The app no longer exposes its screen, navigation actions or authenticated source builder. The gateway no longer serves its HTML, cookie sessions or socket paths. Browser/Computer viewer registrations for that removed prefix are also removed. Native viewer features remain separate.

## DSH seam qualification

The pinned DSH 0.2.1-rc.2 `dsh-client-connection` shares a browser Peer for cookie-authenticated calls. Arbitrary request headers are not copied into the native Remote invocation. Its HTTP `connection/request` waterfall does not cover `remote.mux`; wrapping only that waterfall cannot establish unified provenance. The native gateway rejects stream calls to unary methods before invoking them, but it does not provide the requested application route policy hook. DSH upstream changes are unavailable.

BotHarness therefore owns admission at its existing Device Gateway, before forwarding to native Typert/API Gateway. It does not modify DSH, import a private DSH module, patch method prototypes or register another `/api` interceptor. Native dispatch still owns method resolution, schemas, permissions and execution. HTTP URL endpoints must match the envelope method in the native transport. Native mux endpoints use exactly `namespace/method`, without decoding or alias normalization.

The cloudflared-only origin overwrites all caller route headers, including raw mixed-case duplicates, with a process-local random capability. The gateway strips untrusted route headers on other ingress paths. HTTP and upgrade share this rule; `Host`, `Origin`, DNS and caller-supplied route labels never confer Host-side provenance. The capability is not persisted or logged. The Client recognizes its selected validated Connect route solely to refuse before serialization; that Client check does not establish Host authority.

## Secret entry inventory

The pure policy table in `packages/core/src/bridge/secret-route.ts`, re-exported beside Remote markers in `rpc.ts`, is shared by the gateway and the browser/phone Host client.

| Endpoint                                                 | Secret entry and restriction                                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `botharness/privateInputSubmit`                          | Account values, provider/API tokens, private MCP credentials. Refused before consuming the native method.                                                                     |
| `botharness/privateInputReplace`                         | Starts a replacement flow. Refused as requested even though it takes identifiers rather than original secret values.                                                          |
| `botharness/cloudConnections`                            | `operation: import` accepts a Cloud Agent credential. Entire endpoint is conservatively refused, including list/policy/remove operations. Local management remains available. |
| `credentials/set`                                        | Native DSH Credentials Provider raw value input, including provider API keys and IM tokens.                                                                                   |
| `settings/update`, `settings/replace`, `settings/mutate` | Native generic configuration writes can contain inline legacy credentials or private MCP environment values. Entire methods are refused, including nonsecret settings.        |
| `dsh-im/app-setup`                                       | Provider `setup.credentials` carries application secrets. Entire legacy endpoint is refused, including start/poll/cancel/verify.                                              |

Private account status/cancellation/revocation and private MCP enable/remove accept identifiers or existing references; they remain usable. Model selection/presets accept model routes, not provider keys. Cloud work uses stored credentials. Destructive-operation confirmation tokens are short-lived confirmations, not credential-entry methods. Native account sign-in is a Host-owned authorization flow, not a raw token setter. Device pairing, push tokens and tunnel administration are distinct HTTP capabilities; Track A does not claim to encrypt them. General text, files, terminal commands and arbitrary plugin inputs cannot be classified by this small table. New credential-entry methods require an audit and policy update.

## Refusal and transport lifecycle

Unary refusal uses the native `server-response` shape, preserving the caller's `rpcId` and `secret-route-refused`. The gateway bounds refusal-body parsing. The mux adapter checks each `open` endpoint before forwarding any corresponding payload, returns the native stream error shape, and leaves allowed streams to native dispatch. It bounds frames, buffered output and active streams, refuses malformed client frames, and closes both sockets when the device is revoked or either side disconnects. A disconnected mutating call is never replayed.

The phone and Web Client remote chat share the selected-route preflight. Private input fields are absent on Connect; cancellation remains available. The phone explains that entry requires the Host client or a browser over Tailscale. Direct loopback and Tailscale retain native dispatch and existing credential ownership. Track A adds no new RPC or CLI command: `ask-secret-*` and `connect-status` remain the existing CLI paths; Track B proposes channel state and fingerprint output separately.

## Evidence boundaries

`packages/core/test/connect-secret-route.test.ts` exercises real HTTP/WebSocket gateway adapters with a native-dispatch fixture. It covers each marked method on unary and mux, ordinary streams, revocation and browser tickets. `device-gateway.test.ts` covers forged route tags, upgrades and removed WebView paths. Host-client tests assert zero network requests and no argument serialization on Connect. Those fixtures do not qualify actual Tailscale, Cloudflare, mobile devices or DSH execution. Runtime receipts and screenshots in the PR identify the precise environment; unrun native or network paths remain separate QA gates.
