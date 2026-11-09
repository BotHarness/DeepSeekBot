---
section: Added
---

## en

- Bring your own proxy or tunnel: register any HTTPS origin that forwards the encrypted phone channel to the Host (ingress standard with nginx/Caddy/frp/ngrok references), with a public check before pairing, an optional LAN bind and `private-ingress-enable`/`-disable` CLI ([#3797](https://github.com/BotHarness/DeepSeekBot/issues/3797)).
- Add a no-Docker private connection: the desktop Host runs its bundled cloudflared as a Quick Tunnel or your own Named Tunnel, publishes only the encrypted phone channel, and offers a pairing code only after the public address is checked. Includes `private-tunnel-enable`/`private-tunnel-disable` CLI ([#3742](https://github.com/BotHarness/DeepSeekBot/issues/3742)).
- Add an opt-in Docker private connection candidate with secure first-owner claim, pinned-Host phone pairing, encrypted outbound relay and matching CLI. Setup explains the public HTTPS prerequisite; official login and relay are not required. Native external-network acceptance remains tracked separately ([#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746)).

## zh

- 支持自带代理或隧道：登记任意把加密手机通道转发到电脑的 HTTPS 地址（入站标准，附 nginx/Caddy/frp/ngrok 参考），配对前先做公网实测，可选局域网监听，并提供 `private-ingress-enable`/`-disable` CLI（[#3797](https://github.com/BotHarness/DeepSeekBot/issues/3797)）。
- 新增无需 Docker 的私有连接：电脑 Host 运行内置 cloudflared（Quick Tunnel 或自己的 Named Tunnel），只公开加密的手机通道，并在确认公网可达后才提供配对码；含 `private-tunnel-enable`/`private-tunnel-disable` CLI（[#3742](https://github.com/BotHarness/DeepSeekBot/issues/3742)）。
- 新增可选的 Docker 私有连接候选：安全首次认领、固定 Host 身份的手机配对、加密出站中继及对应 CLI。设置明确说明公网 HTTPS 前提，不依赖官方登录和中继。真机外网验收仍单独跟踪（[#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746)）。
