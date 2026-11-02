# Connection method explanations

Source: `37c7a18d1e28825bb83ef3c99f2828544182e04a`. Actual isolated Host, English, 1280 × 900. No mock route state or image compositing.

- `d0.png`: method selection with short second-line descriptions.
- `d1.png`, `d2.png`, `d3.png`: Local network, Tailscale and Tobs Connect hover explanations.
- `d4.png`: actual Tab navigation opens the Connect explanation.
- `d5.png`: the same focused control in dark mode.

Before: `s2.png` at `a54f4fe0b194`. Earlier step-by-step screenshots remain historical flow evidence; these images supersede the method-choice presentation.

The shared tooltip uses zero configured hover/focus delay. The live run observed all three tips and keyboard activation, with no captured page errors. Chinese and English copy are included; this capture run covers English. No screen-reader or native-device verification is claimed.

Copy distinguishes direct LAN traffic, encrypted Tailscale direct/relay transport, and Cloudflare-carried Tobs Connect traffic. Pairing still requires fingerprint comparison and approval. Connect channel content is end-to-end encrypted; routing metadata is not hidden. Sources: repository ADR-0244 and `docs/architecture/connect-channel-v1.md`, plus [Tailscale connection types](https://tailscale.com/docs/reference/connection-types) and [encryption](https://tailscale.com/docs/concepts/tailscale-encryption).

Validation: 38 focused tests, lint, typecheck, full build, changelog guards and formatting passed. The final English subtitle shortening was formatted and rebuilt before capture. This follow-up changes presentation and copy, not connection transport or authorization.
