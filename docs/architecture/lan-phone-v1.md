# Encrypted LAN phone access

[#2599](https://github.com/BotHarness/DeepSeekBot/issues/2599) is the first slice of the accepted [#2598](https://github.com/BotHarness/DeepSeekBot/issues/2598) design. Native qualification and Human acceptance are separate from source tests.

## Authority and lifecycle

LAN starts off. Devices → Local network access, or `deepseekbot device-lan enable --confirm`, opens a restricted IPv4 listener. The Profile's Credentials Provider stores its port for restart. Disabling closes LAN sockets and removes the preference; Connect remains independent.

This refines ADR-0199's same-listener transport decision. DSH stays loopback-bound; the application-defined adapter exposes only WebSocket upgrade at `/botharness-device/channel`. All ordinary HTTP paths return 404. Authorization, cookie, browser Origin and subprotocol headers are refused before upgrade. No operator API, general proxy or Web Client is exposed.

The adapter instantiates the existing encrypted gateway against the same Host key and Device Pairing owner. Admitted requests traverse the existing loopback device gateway and its normal authorization checks. There is no second device store or business dispatcher. Revocation closes that device's channels across transports.

## Trust and compatibility

A computer QR includes an expiring one-use offer, Host key and candidate addresses. Scanning it in the installed app pins that key; pasted and external links retain fingerprint comparison. The computer still approves the exact phone key. Handshake success alone grants no authority.

LAN uses the existing Noise XK profile and framing with the final prologue field `lan`. Connect retains `connect`. Credentials follow authentication; LAN never falls back to plaintext. Missing keys refuse until the later legacy-upgrade slice. This slice advertises RFC 1918 IPv4 routes, prefers LAN for encrypted enrollment, and retains the encrypted carrier's viewer restrictions. IPv6, changed-address discovery and safe proactive handover are not implemented here.

## Native carrier

The local Expo `LanChannel` module accepts only a private IPv4 address and port, fixes the channel path, and carries bounded hexadecimal Noise frames. It has no general HTTP or header API. A missing module refuses with `lan-build-required`; new native builds are required.

- iOS uses an ephemeral `URLSessionWebSocketTask`, no cookies, credentials or redirects, bounded receive size, and `NSAllowsLocalNetworking`. It does not enable arbitrary loads. See [Apple's ATS contract](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking).
- Android uses a private OkHttp client with redirects and proxies disabled. Only `encrypted-lan.invalid` receives the carrier exception; per-connection DNS maps that reserved name directly to validated private IPv4 bytes, without external resolution. Separate pools prevent alias reuse across Hosts. General HTTP stays denied; loopback and the emulator Host alias retain development access. See [Android's domain policy](https://developer.android.com/privacy-and-security/security-config).

The reserved name is neither discovery nor trust. Noise authenticates the Host. Permission denial, network isolation and firewalls can still prevent access.

## Qualification

`device-lan.test.ts` exercises opt-in, HTTP refusal, scanned enrollment, exact approval, encrypted requests, revocation, restart and shutdown through the actual pairing and mobile carrier owners. Native compilation, camera scanning, real Host Feed, offline state, model replies and visual acceptance require the assigned device QA batch. Record each platform separately and do not infer native success from source tests.
