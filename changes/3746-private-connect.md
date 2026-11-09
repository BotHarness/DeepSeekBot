---
section: Added
---

## en

- Company networks without internet: the private connection check trusts the operating system's certificates (including ones installed by device management), and phones that do not trust the certificate now see a specific message instead of a generic connection error ([#3799](https://github.com/BotHarness/DeepSeekBot/issues/3799)).
- The Docker private relay serves several computers: `setup.mjs add-host <name>` creates a one-time claim key per computer, each with its own phone admission, and one computer releasing or revoking never affects another. Existing single-computer deployments keep working. The relay standard and a conformance script are documented for third-party relays ([#3798](https://github.com/BotHarness/DeepSeekBot/issues/3798)).
- Bring your own proxy or tunnel: register any HTTPS origin that forwards the encrypted phone channel to the Host (ingress standard with nginx/Caddy/frp/ngrok references), with a public check before pairing, an optional LAN bind and `private-ingress-enable`/`-disable` CLI ([#3797](https://github.com/BotHarness/DeepSeekBot/issues/3797)).
- Add a no-Docker private connection: the desktop Host runs its bundled cloudflared as a Quick Tunnel or your own Named Tunnel, publishes only the encrypted phone channel, and offers a pairing code only after the public address is checked. Includes `private-tunnel-enable`/`private-tunnel-disable` CLI ([#3742](https://github.com/BotHarness/DeepSeekBot/issues/3742)).
- Add an opt-in Docker private connection candidate with secure first-owner claim, pinned-Host phone pairing, encrypted outbound relay and matching CLI. Setup explains the public HTTPS prerequisite; official login and relay are not required. Native external-network acceptance remains tracked separately ([#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746)).

## zh

- 支持无外网的公司内网：私有连接检查会信任系统证书（包括设备管理安装的证书）；手机不信任证书时会显示明确提示，而不是笼统的连接失败（[#3799](https://github.com/BotHarness/DeepSeekBot/issues/3799)）。
- Docker 私有中继可以服务多台电脑：`setup.mjs add-host <名称>` 为每台电脑生成一次性认领密钥，各自拥有独立的手机准入，一台电脑释放或撤销不会影响其他电脑。原有单台部署照常工作。中继标准和一致性测试脚本已写成文档，供第三方中继使用（[#3798](https://github.com/BotHarness/DeepSeekBot/issues/3798)）。
- 支持自带代理或隧道：登记任意把加密手机通道转发到电脑的 HTTPS 地址（入站标准，附 nginx/Caddy/frp/ngrok 参考），配对前先做公网实测，可选局域网监听，并提供 `private-ingress-enable`/`-disable` CLI（[#3797](https://github.com/BotHarness/DeepSeekBot/issues/3797)）。
- 新增无需 Docker 的私有连接：电脑 Host 运行内置 cloudflared（Quick Tunnel 或自己的 Named Tunnel），只公开加密的手机通道，并在确认公网可达后才提供配对码；含 `private-tunnel-enable`/`private-tunnel-disable` CLI（[#3742](https://github.com/BotHarness/DeepSeekBot/issues/3742)）。
- 新增可选的 Docker 私有连接候选：安全首次认领、固定 Host 身份的手机配对、加密出站中继及对应 CLI。设置明确说明公网 HTTPS 前提，不依赖官方登录和中继。真机外网验收仍单独跟踪（[#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746)）。
