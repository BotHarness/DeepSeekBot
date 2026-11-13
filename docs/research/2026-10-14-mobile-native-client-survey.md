# 移动端原生体验调研 — t3code / Happy / opencode 怎么做 · DSH 的推荐路径

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题     | 开源 Agent 应用（t3code 等）如何提供移动端？是否本质是「SSH / Tailscale 远程连到某台电脑上的服务」？DSH / DeepSeekBot 要在手机上有**原生体验**，怎么做？                                                                                                                |
| 日期     | 2026-10-14                                                                                                                                                                                                                                                              |
| 前序     | [2026-09-23 移动端接入调研](./2026-09-23-mobile-remote-access-strategy.md)（#219，结论：Phase 1 隧道 + 浏览器/PWA，Phase 2 Expo WebView 薄壳）；[手机 QA 隧道 runbook](../agents/phone-qa-tunnel.md)                                                                    |
| 上游来源 | `pingdotgg/t3code` main 分支 `docs/user/remote-access.md`、`docs/internals/t3-connect.md`、`infra/relay/README.md`、`apps/mobile/package.json`；`slopus/happy` README；opencode.ai `/docs/web/`。访问 2026-10-14。DSH 官方文档站本次无法访问，DSH 约束沿用 09-23 结论。 |
| 结论     | 见 §4。一句话：**做 Expo 原生 App，但只把手机高频任务做成原生界面，其余通过 WebView 打开完整 DSH Web Client；原生界面走我们自己拥有的 Host bridge 合约（与 live CLI 同一条路），连接先用配对 + Tailscale HTTPS，推送用 Expo Push，自建 relay 后置。**                   |

## 1. 「本质是 SSH / Tailscale 远程连接」——对一半

**对的部分**：三个项目里 Agent 都跑在你自己的那台机器上（t3 叫 environment，Happy 是 CLI/桌面端所在电脑，opencode 是 `opencode serve` 所在机器）。手机只是遥控器，机器必须开着且可达。

**需要修正的部分**：连接方式不止 SSH / Tailscale，各家差别很大，而且「原生体验」不是靠连接方式解决的，是靠手机端是否原生 App + 是否有推送。

| 项目     | 手机端形态                                                                                       | 连接方式                                                                                                                                                                                                                                                                                         | 推送                                                        |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| t3code   | **原生 React Native（Expo）App**，`apps/mobile`，上架 App Store / Google Play；不是 WebView 套壳 | 多路由并存，按顺序自动选第一个能通的：① LAN 直连配对（`t3 serve --host <ip>` + `t3 pair` 二维码，一次性 token）；② Tailscale HTTPS（`t3 serve --tailscale-serve`，生成 `https://机器.tailnet.ts.net`）；③ **T3 Connect**（官方托管）；④ 桌面端「托管 SSH」——这是**桌面连远程机器**，不是手机路线 | T3 Connect relay 负责 APNs / FCM 推送和 iOS Live Activities |
| Happy    | 原生 Expo App（iOS / Android / Web 同码）                                                        | **全部流量经 happy-server relay**，但端到端加密（TweetNaCl，密钥只在设备上），relay 只转密文                                                                                                                                                                                                     | 走 relay                                                    |
| opencode | 无官方 App；`opencode web` 是浏览器 UI                                                           | 自己负责网络：`--hostname 0.0.0.0` / `--mdns` + `OPENCODE_SERVER_PASSWORD`；社区方案再叠 Tailscale                                                                                                                                                                                               | 无                                                          |

### T3 Connect 的关键设计（最值得抄的部分）

- 机器端用 Clerk 账号登录 relay；relay 为该机器**托管分配 Cloudflare Tunnel + 主机名**，隧道只暴露经校验的 loopback origin。
- 手机通过 relay 拿一次性 bootstrap 凭证（绑定手机的 DPoP 密钥），再**直接与机器交换**会话 token；relay 拿不到会话 token。
- **relay 不在数据热路径**：建连后 HTTP / WebSocket 直接走隧道到机器。relay 只做：机器发现、凭证签发、隧道生命周期、推送 / Live Activity、webhook 转发。
- 通过任一路由连上后，客户端会学到机器当前的 LAN / Tailscale 地址并加为备用路由：在家自动走局域网，出门走隧道。

对比：Happy 的 relay 在热路径上（加密换来不用打洞/隧道）；t3 的 relay 只是控制面（流量直连，但要运营隧道）。

## 2. 我们的约束（相对 09-23 无变化）

1. `dsh web` 必须 loopback，`/api` 等价远程代码执行；对外只能经鉴权网关 / trusted host + 隧道。
2. DSH 插件 UI（含 BotHarness 的 roster、Channel、Activity、设置）是 Web DOM 代码，原生 RN 渲染不了。
3. 但现在有一个 09-23 时不存在的事实：**live CLI 已经是 Host 的非 UI Consumer**。`packages/core/src/bots/cli-live.ts` 接受 loopback 或 tailnet HTTPS origin，用 Host token 登录换 authority cookie，再调用 Host bridge 方法完成「发 DM 并等 Bot 回复」「回答提问」「审批工具调用」（见 `2026-10-11-cli-ui-capability-gaps.md`）。这正是手机原生界面需要的那组能力，而且合约归我们自己（`packages/core/src/bridge/methods.ts`），不是追 DSH 未版本化的内部 `/api`——09-23 否决「纯原生协议客户端」的主要理由因此弱化了。

## 3. 选项

| 选项                                           | 原生感                                                                 | 插件 UI                   | 成本 / 风险                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| A. 浏览器 / PWA（09-23 Phase 1）               | 低：键盘、滚动、手势都是网页；iOS 推送须先「添加到主屏幕」且只有 16.4+ | 全有                      | 最低；但 manifest / service worker 属于 DSH Web 外壳，插件不一定能注入 |
| B. Expo + 全屏 WebView 薄壳（09-23 Phase 2）   | 中：外壳原生、推送原生，主体仍是网页                                   | 全有                      | 低；体验上限受 DSH Web 小屏适配限制                                    |
| C. 完全原生（t3code 路线）                     | 高                                                                     | 无，每个面要重写一遍      | 高；t3 能这么做是因为整个 UI 都是他们的，我们不是                      |
| **D. 混合：高频面原生 + 其余 WebView（推荐）** | 高（在最常用的地方）                                                   | 全有（通过 WebView 兜底） | 中；原生面只调用我们拥有的 Host bridge 合约，和 CLI 共用               |

连接与推送（与 A–D 正交）：

- **连接**：照抄 t3 的「配对 + 多路由」模型。Host 插件生成一次性配对二维码（token 绑定设备密钥，可按设备吊销）；路由优先 Tailscale HTTPS（`tailscale serve` + `--trusted-host`，现有 CLI 已接受 tailnet HTTPS origin），其次 Cloudflare Tunnel（runbook 已验证），在家走 LAN。**不自建 relay、不做 Happy 式全流量中继。**
- **推送**：原生推送需要 APNs / FCM 凭证。不必像 t3 一样自建 relay：Host 可直接把**不含内容**的通知（「某 Bot 在等你审批」）POST 给 Expo Push Service，手机点开后再经隧道拉详情。零成本兜底：现有 Lark / Discord Channel 本来就能在手机上推送。

## 4. 推荐路径（按 tracer bullet 切片）

1. **配对 + 一条路由 + 原生 DM**：Host 插件出配对二维码；Expo App 扫码，经 Tailscale HTTPS 连上；原生界面只有「Bot 列表 → 与某 Bot 的 DM：发消息、看流式回复」，右上角「打开完整版」进 WebView 加载 DSH Web Client。走现有 bridge 方法，不另起存储。
2. **提问与审批原生化 + 推送**：原生收件箱处理 Human question / Tool approval（CLI 已有对应命令），Host 经 Expo Push 发无内容通知。这是手机上最高频、最需要原生的场景。
3. **路由扩展**：Cloudflare Tunnel 作为第二路由、LAN 自动学习、按设备吊销 UI。
4. **按使用数据决定**是否把 Activity、群聊等再原生化；设置、记忆、市场等低频面长期留在 WebView。
5. 只有当需要「不装 Tailscale、扫码即用」的大众分发时，才考虑 t3 式托管 relay（账号 + 托管隧道 + 推送）。

与 09-23 结论的关系：保留「先验证连接、不自建 Signal / WebRTC、不裸奔 0.0.0.0」；修订「不做纯原生协议客户端」为「高频面原生，合约用我们自己的 Host bridge，其余 WebView」。若接受，应补一份 ADR。

## 5. 未验证 / 待确认

1. t3code 移动端未实机安装，结论来自源码与官方文档。
2. Happy 的密钥交换细节未逐文件阅读，只采信 README 的「端到端加密 relay」描述。
3. DSH 官方文档站本次无法访问，未确认 0.2.x 是否新增官方远程能力。
4. Expo Push 依赖 Expo 的服务与账号；若不可接受，需要自建 APNs / FCM 发送端。
5. bridge 方法目前面向 CLI 设计，是否需要为长连接流式回复补订阅接口，第 1 片实现时确认。
