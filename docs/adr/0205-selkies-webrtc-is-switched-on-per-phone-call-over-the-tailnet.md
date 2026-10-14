---
Status: Proposed
Date: 2026-10-14
---

# Selkies WebRTC is switched on per phone call over the tailnet

Container Computer and the Container Browser stream through Selkies, which today runs in its WebSocket mode. A phone controlling one of them remotely needs low-latency video, and Selkies can carry the same video over WebRTC ([#1799](https://github.com/BotHarness/DeepSeekBot/issues/1799)). Three facts constrain the design. Selkies runs one transport per container at a time, and switching restarts the stream for every connected page, including the desktop Web Client's viewer. WebRTC media is UDP straight from the container to the phone, so it needs a reachable address and never passes through the device gateway. And [ADR-0199](0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md) pairs phones over Tailscale first, so the phone can reach the Host's tailnet address directly. We decided: **a container keeps WebSockets as its transport and has WebRTC configured beside it; a phone's call switches it to WebRTC for as long as the call lasts, with media relayed by the Host on the tailnet address only and no STUN or TURN server.**

## Decision

- **Configured at creation, idle until a call.** When the Host has a tailnet address, a new Computer or Container Browser container starts with `SELKIES_MODE=websockets`, dual mode, ICE-lite, one UDP mux port advertised at the tailnet address, and an RTC configuration file with an empty ICE server list. Docker publishes that UDP port on loopback only. A Host without a tailnet creates the container exactly as before. A running Computer is never recreated just to add WebRTC; it picks it up at its next start.
- **The Host owns the media port.** While a call is open, the Host binds the advertised port on the tailnet address and relays each phone address to the loopback-published port through its own socket. Senders outside `100.64.0.0/10` are dropped. Nothing listens on that port between calls, and nothing is ever published on a public interface.
- **One call switches the transport.** Opening the signalling route (`/api/computer/webrtc/signaling`, `/api/browser/webrtc/signaling?viewer=<id>`) writes the empty RTC configuration, opens the relay and posts Selkies' own mode switch to `webrtc`, then pipes the socket to Selkies' signalling WebSocket. When the last call's socket closes, the Host switches the container back to `websockets` and closes the relay, which ends the peer connection. The desktop viewer reconnects once at each switch.
- **Signalling only through the device gateway.** A phone opens the signalling route through `/botharness-device/api/…` on its device credential. Revoking the device closes that socket, so the same release ends the call within the Selkies session hold.
- **WebSockets is the fallback, decided up front.** `GET /api/computer/webrtc` and `/api/browser/webrtc?viewer=<id>` report the advertised address and port, or a refusal code with `fallback: "websocket"`: `not-running`, `media-unavailable`, `tailnet-unavailable`, `tailnet-changed`. The signalling route refuses with the same codes, plus `media-port-busy`, `switch-failed` and `signaling-unavailable`. The phone keeps the existing WebSocket viewer in every one of these cases, and when ICE fails after a switch, closing the socket restores WebSockets.

## Consequences

- The desktop Web Client keeps its WebSocket stream except while a phone is calling. During a call it is interrupted; a desktop page that wants the stream back has to wait for the call to end. Viewing on both at once is out of scope for this slice.
- A tailnet address that changes after the container was created reports `tailnet-changed` until the container is recreated at its next start.
- Routes outside the tailnet (STUN, TURN, a public address) are excluded. Adding one later means a new refusal-free path, not a change to this one.
- Selkies is used as is (MPL-2.0). The phone talks Selkies' own signalling protocol (`HELLO`, `SESSION`, `<peer-id> {"sdp"|"ice"}`), and retries `SESSION server` while the WebRTC service is still starting.
