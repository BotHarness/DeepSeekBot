---
section: Added
---

## en

- When the Host is on a Tailscale tailnet, Container Computer and the Container Browser can now stream to a paired phone over WebRTC. The call switches the container to WebRTC only while it lasts, sends media over the tailnet address alone with no STUN or TURN server, and ends when the phone is revoked. Without a tailnet, or when the call cannot start, the WebSocket stream stays in place. `deepseekbot computer-webrtc` and `browser-webrtc` report and probe it ([#1799](https://github.com/BotHarness/DeepSeekBot/issues/1799)).

## zh

- Host 加入 Tailscale tailnet 后，容器 Computer 和容器 Browser 可以通过 WebRTC 把画面推到已配对的手机。只有通话期间容器才切到 WebRTC；媒体只走 tailnet 地址，不使用任何 STUN 或 TURN 服务器；撤销手机会结束通话。没有 tailnet 或通话无法建立时，继续使用原来的 WebSocket 画面。`deepseekbot computer-webrtc` 和 `browser-webrtc` 可以查看状态并试连（[#1799](https://github.com/BotHarness/DeepSeekBot/issues/1799)）。
