# 托管 Connect 调研：登录即连回电脑，不装 Tailscale

## 0. 元信息

| 项     | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题   | 能否像 T3 Connect 一样：电脑和手机用同一个账号（WorkOS）登录后自动连上，手机经我们托管的隧道或中继访问电脑，不再需要 Tailscale？选哪条路，成本、加密、滥用风险各是什么？（[#2387](https://github.com/BotHarness/DeepSeekBot/issues/2387)）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 日期   | 2026-10-20                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 一手源 | [pingdotgg/t3code](https://github.com/pingdotgg/t3code) 浅克隆 `d7bc3a2f`：`docs/internals/t3-connect.md`、`docs/internals/environment-auth.md`、`docs/operations/connect-setup.md`、`docs/user/remote-access.md`、`docs/user/t3-connect-troubleshooting.md`、`infra/relay/`。[cloudflare/cloudflare-docs](https://github.com/cloudflare/cloudflare-docs) 浅克隆 `080b665d`：`tunnel/features/tunnels-for-platforms.mdx`、`cloudflare-one/account-limits.mdx`、`durable-objects/platform/pricing.mdx`、`durable-objects/platform/limits.mdx`。WorkOS：[CLI Auth](https://workos.com/docs/authkit/cli-auth)、[Pricing](https://workos.com/pricing)。本仓库：ADR-0199、ADR-0202、ADR-0229、ADR-0230、`packages/core/src/devices/`、`apps/mobile/src/host/route.ts`。 |
| 结论   | **推荐 A：每台电脑一条由我们代管的 Cloudflare Tunnel，WorkOS 账号只负责发现电脑和签发一次性配对凭据，应用流量走隧道、不经过我们的 Worker。** 这就是 T3 Connect 的形状，并且能直接接到 ADR-0199 的路由列表上。B（自建 Durable Object 中继）留作中国大陆可达性不行时的后备；C（托管 mesh）不做。先做一个 spike 验证大陆网络和 `cloudflared` 分发，再定。                                                                                                                                                                                                                                                                                                                                                                                                             |

## 1. T3 Connect 实际怎么做（一手源）

- **身份**：Clerk 账号。桌面端、手机端走原生 OAuth，CLI 用 PKCE；SSH/无浏览器环境用 OAuth 设备授权（RFC 8628）（`docs/internals/t3-connect.md` “OAuth traps”）。
- **隧道**：每个 environment（≈ 我们的 Host）一条 Cloudflare Tunnel，主机名 `prod-<digest>.<tunnel zone>`。中继 Worker 通过 Cloudflare API 创建隧道和 DNS，主机上跑 **固定版本** 的 `cloudflared`，用中继下发的 connector token 连接（`t3-connect.md` “The relay client follows the server's pin”、`infra/relay/src/environments/ManagedEndpointProvider.ts`）。
- **中继不转发应用流量**：“After bootstrap, clients send application traffic through the environment's tunnel hostname; the relay Worker does not proxy their HTTP or WebSocket sessions.” 唯一例外是 webhook 转发。
- **中继是受信任的经纪人**：已登录用户还必须有该 environment 的 link。中继请 environment 签发一个**绑定客户端 DPoP 公钥的一次性 bootstrap 凭据**，客户端再直接向 environment 换取 environment session；中继拿不到 session token，只拿到 bootstrap 凭据也换不出来（缺私钥）。双方都对这次交换做签名校验。T3 也明说：中继的签名密钥若被攻破，DPoP 挡不住。
- **只暴露回环源站**：托管隧道只指向经过校验的 loopback HTTP origin；拒绝转发头；不跟随重定向，避免变成任意出站。
- **成本控制**：“Cloudflare bills a tunnel whether or not a connector is attached”，所以中继每 5 分钟回收离线 ≥5 分钟的隧道（保留主机名和分配记录），主机回来时重建。
- **排障**：手机 → T3 Connect → 主机隧道 → T3 Code 四段；常见坑是主机出站 7844 端口（TCP/UDP）被 VPN、公司防火墙或 Tailscale exit node 挡住（`docs/user/t3-connect-troubleshooting.md`）。
- **路由并存**：Connect、局域网、Tailscale HTTPS 一起进有序路由列表，“connects over the first route that answers”，连着慢路由时会探测快路由并切回（`docs/user/remote-access.md`）。
- **权限**：配对默认授予全部权限；`terminal:operate` 等同于 shell，所以“扣掉管理权限不构成边界”（`docs/internals/environment-auth.md`）。

## 2. 我们已经有的

- **设备网关**（ADR-0199）：手机只访问 `/botharness-device/*`，带每设备凭据；配对链接里有**有序路由列表**；吊销立即生效；记录里预留了设备公钥字段，就是为 DPoP 留的。加一条 Connect 路由，手机协议不用改。
- **路由探测**（`packages/core/src/devices/routes.ts`）：现在只认 Tailscale 和 loopback；手机端 `apps/mobile/src/host/route.ts` 也只接受 `*.ts.net` 和 loopback。两处都要放开一个我们自己的域名。
- **WorkOS**：TOB 已有 WorkOS 登录、手机 PKCE、SecureStore 存会话（ADR-0229/0230）。WorkOS 也有 CLI Auth（RFC 8628 设备授权，2025-06 上线），适合 `deepseekbot connect` 在无界面或 SSH 场景登录。
- **推送**（ADR-0202）：无内容推送走 Expo，与连接方式无关，不需要动。

## 3. 三条路对比

| 维度           | A. 代管 Cloudflare Tunnel（T3 方式）                                                                                   | B. 自建中继（Workers + Durable Objects）                                                                                                         | C. 托管 mesh（Headscale / 内嵌 WireGuard）                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 手机拿到什么   | `https://<host>.<我们的域名>` 一个普通 HTTPS 源站，WebView 全量客户端、查看器 WebSocket 都能直接用                     | 需要我们自己把 HTTP、WebSocket 封装到中继里；WebView 全量客户端要一个真正的 HTTP 源站，等于重写一个隧道                                          | iOS 需要 Network Extension（VPN 配置），等于自己做一个 Tailscale App |
| 电脑端         | 下载并固定版本的 `cloudflared`，出站 7844 端口                                                                         | 只需出站 443 WebSocket，不用新二进制                                                                                                             | 内嵌 WireGuard/tsnet 或要求装客户端                                  |
| 成本           | 每个账号前 1,000 条隧道免费，超出 $4.50/条/月；离线隧道也计数，要回收                                                  | 按请求和时长计费：$0.15/百万请求（WebSocket 消息 20:1 计）、$12.50/百万 GB-s，Workers Paid 起步 $5/月；Computer 截图流这类大流量会明显增加请求数 | 自运维控制面和 DERP，成本最高                                        |
| 端到端加密     | **没有**：TLS 在 Cloudflare 边缘终止，Cloudflare 能看到明文；我们的 Worker 看不到。要 E2E 需在应用层再加一层           | 可以设计成 E2E（配对时交换密钥，中继只转密文）                                                                                                   | WireGuard 天然 E2E                                                   |
| 暴露面         | 电脑的 DSH 监听口出现在公网主机名后面。**必须用 `cloudflared` ingress 只放行 `/botharness-device/*`**，其余路径 404    | 只暴露我们定义的协议                                                                                                                             | 只在 mesh 内                                                         |
| 滥用风险       | 主机名可被用来托管钓鱼页：只放行设备网关路径就基本消除；隧道数量要按账号限额                                           | 免费带宽中继可能被滥用当代理：要按账号限流                                                                                                       | 低                                                                   |
| 工作量         | 中：中继 Worker（账号、link、隧道分配和回收）、`cloudflared` 分发与版本固定、Host 端 link 服务、手机端登录和 Host 列表 | 高：上面全部加上传输层                                                                                                                           | 很高                                                                 |
| 中国大陆可达性 | **未验证，主要风险**。Cloudflare 普通网络在大陆可用性不稳定，7844 出站也可能受限                                       | 同样跑在 Cloudflare 上，风险相同；好处是只需 443                                                                                                 | DERP 节点选址决定                                                    |

成本来源：`tunnel/features/tunnels-for-platforms.mdx`（“Every account includes 1,000 tunnels at no cost”“$4.50 per additional tunnel per month”“Every tunnel that exists in your account counts toward your limit. This includes tunnels that are inactive”）；`durable-objects/platform/pricing.mdx`（示例中的单价与 20:1 计费比）。Cloudflare Tunnel 文档没有列出按流量收费，未在本次核实范围内。

## 4. 账号被盗与中继被攻破时会怎样

- **只靠登录自动连（Human 要的体验）**：拿到 WorkOS 账号就能让新手机连上电脑，而一台已配对手机等同于电脑上的 Human（ADR-0199：“A paired device has the Human's full authority”），也就是 shell 级权限。T3 Connect 接受了这个前提。
- **缓解**：(1) 电脑要先主动“开启 Connect”，登录本身不让电脑可达（T3 同样如此）；(2) 新设备连上时在电脑和其他已配对手机推送“新设备已连接”，设备页一键吊销；(3) 账号侧要求邮箱验证并建议开启 passkey/MFA；(4) 可选：新设备首次连接需在电脑上点一次确认。(4) 最安全，但违背“登录就能用”，交给 Human 决定。
- **中继签名密钥泄露**：与 T3 一样，能冒充中继去请电脑签发 bootstrap 凭据。只能靠密钥保管（Workers Secrets）和电脑端校验 link 归属来限制。
- **Cloudflare 可见明文**：A 方案下 Cloudflare 边缘能看到设备网关流量（含聊天内容）。如果不能接受，就要在设备网关上加应用层加密，这会影响 WebView 全量客户端（浏览器侧无法插入解密层），代价很大。

## 5. 建议

1. **先做 spike（1–2 天）**：用一个测试 Cloudflare 账号手工建一条隧道指向隔离 Host，只放行 `/botharness-device/*`，从中国大陆的手机网络（移动、联通、电信各一）和一台在大陆的电脑测：配对、私信、流式回复、WebView 全量客户端、Computer 查看器。同时测电脑出站 7844 在常见环境（公司网、Clash/代理开启）下能否连上。
2. **大陆可达性可接受**：按 A 做，账号用 WorkOS（复用 TOB 的 WorkOS 环境还是新建一个，见 ADR 草稿的待决项），路由列表顺序为 局域网 → Tailscale → Connect。
3. **大陆可达性不可接受**：A 和 B 都跑在 Cloudflare 上，换 B 也不解决问题；需要考虑国内云（备案、国内节点）的中继，这是另一个量级的决定。
4. 托管 mesh（C）不做。

## 6. 未验证 / 待确认

1. Cloudflare Tunnel 在中国大陆的可达性和延迟（本次无法从容器测量）。
2. Cloudflare 是否对隧道流量另行计费或限速：文档未写，需与账号条款核对。
3. WorkOS 在大陆的登录体验（Google 登录不可用，需邮箱验证码或 passkey）。
4. `cloudflared` 在 Windows 原生桌面端（DSH Desktop）的分发、签名与杀毒误报。
5. T3 的中继代码以 MIT 发布，可参考其隧道分配、回收和版本固定逻辑；直接复用前需核对许可证与依赖（Effect、Alchemy、PlanetScale）。
