# Cindy remote desktop: traffic ownership and what its public source proves

Research date: 2026-10-22. Source revision: `makecindy/cindy@b60f6fadeb89d7a93df9aa1bcb6212f56568ca58`. Read-only source and official-site research; no Cindy runtime, network trace, account, TURN allocation, or billing access was used.

## Finding

Cindy separates the account-authorized Device Link signaling/control connection from WebRTC media. A direct ICE path avoids sending the desktop video through Cindy's application relay; a TURN-selected path uses a media relay; failed video falls back to JPEG through the authenticated application relay. Therefore WebRTC can reduce application-relay traffic, but does not make media traffic or relay infrastructure free. The public repository does not establish Cindy's production TURN vendor, relay selection rate, traffic volume, or infrastructure bill.

The repository explicitly states that its backend lives in a separate repository and is not included. Its remote-desktop documentation says there is no bundled TURN service and that deployed relay availability depends on the service deployment. These statements distinguish client support from production provisioning. [Repository scope](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/README.md#L70-L76), [transport and deployment limits](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/docs/remote-desktop.md#L245-L259), [regional TURN requirement](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/docs/remote-desktop.md#L307-L313).

## Actual configuration path

- Each viewer attempt and the controlled Desktop obtain `GET /api/device-link/ice-servers` from their authenticated Device Link service. The response is `{ iceServers: [{ urls, username, credential }], expiresAt }`. The owning backend supplies the node pool. Short-lived TURN allocation credentials may cross the dedicated media bridge; account credentials do not. [Documented contract](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/docs/dev-rules/remote-desktop-connectivity.md#L8-L27), [Desktop implementation](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/main/remote-desktop/iceConfig.ts#L1-L18), [Mobile implementation](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/src/remote-desktop/RemoteDesktopScreen.tsx#L684-L700).
- Bundled endpoint manifests name `https://device-link.cindy.com.cn` for China and `https://device-link.cindy.app` globally. Thus the bundled defaults imply `/api/device-link/ice-servers` under those origins, not a client call to Cloudflare's TURN credential API. Runtime manifests can update endpoints; these are source-revision defaults, not observed production requests. [China manifest](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/config/endpoint.json#L5), [global manifest](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/config/endpoint.global.json#L5), [endpoint discovery](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/main/clientEndpointsService.ts#L4-L33).
- The parser accepts standard STUN/TURN URLs, including UDP, TCP and TLS, validates bounded credentials and expiry, and does not identify a hosting vendor. Missing/invalid/slow configuration falls back to public STUN. The literal Cloudflare endpoint here is `stun:stun.cloudflare.com:3478`; the other is Google STUN. **Cloudflare STUN is not evidence that Cindy buys Cloudflare Realtime TURN.** [Config parser and fallback](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/device-link/src/remoteDesktopIceConfig.ts#L27-L137), [public STUN list](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/device-link/src/remoteDesktopIce.ts#L21-L28).
- The shared resolver does not maintain a credential cache. Mobile nevertheless has a one-shot prefetch for its next media attempt, usable for 30 seconds; avoid interpreting the documentation's no-cache statement as no prefetch anywhere. [Mobile prefetch](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/src/remote-desktop/RemoteDesktopScreen.tsx#L701-L718).

## Which path carries the bytes

| Selected path      | Desktop pictures                                                     | Infrastructure implication                                                                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Direct WebRTC      | Encoded video on the selected ICE peer path                          | Cindy still handles account/signaling traffic; desktop media does not traverse its application relay. Endpoints still upload/download the video. An overlay-network candidate alone does not establish a physically direct underlay. |
| TURN WebRTC        | Encoded video through the selected TURN allocation                   | The deployed TURN operator carries media. Its ingress/egress billing model and any free allowance determine money cost. Public client code does not reveal that operator or contract.                                                |
| JPEG compatibility | Base64 JPEG returned through the authenticated Device Link TLS relay | The application relay carries image payloads. Low frame rate alone does not imply low byte volume.                                                                                                                                   |

The WebViewer creates `RTCPeerConnection({ iceServers })`, receives audio/video and creates an `input-v1` DataChannel. Network statistics distinguish candidate pairs containing `relay` from direct `host`/`srflx`/`prflx` pairs. The mobile controller retains `frame` requests over Device Link while video is unavailable. [Peer creation](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/maker-shared/src/remote-desktop/viewerRuntime.js#L1915-L1922), [route classification](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/maker-shared/src/remote-desktop/viewerRuntime.js#L67-L74), [request relay adapter](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/src/remote-desktop/RemoteDesktopScreen.tsx#L642-L665), [JPEG fallback documentation](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/docs/remote-desktop.md#L251-L259).

## Configured traffic controls and arithmetic

Current Host-owned profiles use these video sender ceilings; congestion control can choose lower rates. The two high ceilings do not mean the profiles behave identically. [Profiles](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/shared/remoteDesktopQuality.ts#L6-L70).

| Profile        | Video ceiling  | Policy                                         | Payload volume if sustained at that ceiling for one hour |
| -------------- | -------------- | ---------------------------------------------- | -------------------------------------------------------- |
| saver          | 2 Mbps         | Maintain frame rate; sharp still frames        | 0.9 GB                                                   |
| auto           | 20 Mbps        | Maintain frame rate; sharp still frames        | 9 GB                                                     |
| hd             | 20 Mbps        | Maintain resolution; text content hint         | 9 GB                                                     |
| Background/PiP | 2 Mbps, 30 fps | Host applies saver ceiling on the current peer | 0.9 GB                                                   |

These decimal-GB values are arithmetic, `Mbps × 3600 / 8 / 1000`, **not Cindy measurements or bills**. They exclude audio, transport headers, retransmissions and unrelated traffic. The minimum/start bitrate fields are bandwidth-estimation hints, not proof of a fixed continuous minimum traffic rate. Background ceilings restore the user's selected profile on foreground return. [Encoder limits](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/shared/remoteDesktopQuality.ts#L77-L113).

Compatibility JPEG is capped at 180,000 bytes before Base64; encoding may reduce quality/size or drop an oversized frame. The current mobile polling timer is 350 ms with at most one request in flight and stops polling once streaming is active. A worst-size image produces approximately 240,000 Base64 bytes. At an ideal 350-ms response cadence that is about 0.686 MB/s, or 2.47 GB/hour of Base64 payload before JSON and before any transport compression. This is an illustrative upper-payload calculation, not measured wire volume: actual frame sizes, empty frames, request latency, compression and time spent in video mode change it. The documentation also states a Host limit of four capture requests per second, which is not the same as this mobile client's configured cadence. [Frame cap](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/device-link/src/remoteDesktop.ts#L14-L17), [encoding boundary](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/main/remote-desktop/frame.ts#L4-L25), [mobile polling](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/src/remote-desktop/RemoteDesktopScreen.tsx#L1557-L1607), [documented Host bound](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/docs/remote-desktop.md#L251-L255).

## Public pricing and remaining unknowns

The official website and pricing page, checked on 2026-10-22, advertise free software and optional paid managed-model service. The pricing page explains model credits; it does not publish a separate remote-desktop GB rate, TURN allowance, media-relay cost, production traffic volume, or infrastructure invoice. This is a bounded observation about the checked sources, not a claim that no such information exists anywhere. Free-to-user software pricing does not establish zero operating cost. [Official pricing](https://cindy.app/pricing), [official landing page](https://cindy.app/).

Still unknown from the inspected public sources: actual TURN pool/vendor and regions; whether a particular live deployment returns TURN at all; direct/TURN/JPEG usage shares; average encoded bitrate and active-view hours; billable byte counting; production cost and subsidy arrangements. Do not substitute an external TURN vendor's price for a claim about Cindy's own bill.

For a BotHarness estimate, measure direct, TURN and JPEG separately. A first approximation is `TURN video GB ≈ viewer-hours × relay-share × average-video-Mbps × 0.45`; then add audio/protocol overhead, JPEG fallback relay bytes and signaling, and apply the selected operator's actual billing rules. Do not multiply every session by Cindy's 20-Mbps ceiling or assume every WebRTC session requires TURN.

## BotHarness 成本模型与选择建议

以下为 2026-10-22 核查的外部服务报价和假设计算，**不是 Cindy 的供应商选择或账单**。

Cloudflare Realtime TURN / SFU 当前按出站 $0.05/GB 计费，每账户每月共享前 1,000 GB 免费额度。Workers 等服务另计。TURN 的精确口径为 Cloudflare edge → TURN client，包括协议开销；官方图明确排除 server ↔ peer 一段，不应机械把媒体上传、下载翻倍。下面假设每份视频在接收侧计费一次，省略音频、开销和重传，真实使用须用供应商计量核对。[官方价格](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)、[TURN 计费方向](https://developers.cloudflare.com/realtime/turn/faq/)。

| 实际平均视频码率 | 每观看小时的视频量 | 全程经一次计费中继的边际流量费，未扣免费额度 |
| ---------------- | ------------------ | -------------------------------------------- |
| 2 Mbps           | 0.90 GB            | $0.045                                       |
| 5 Mbps           | 2.25 GB            | $0.1125                                      |
| 20 Mbps          | 9.00 GB            | $0.45                                        |

单向视频近似式：`GB = Mbps × 0.45 × 观看小时`。同一个桌面同时被两台设备观看，计两份观看时间；这里没有假设 SFU 广播拓扑。直连也消耗用户的宽带上传和手机流量，只是不产生本服务的 TURN 媒体费。tailnet 的 overlay 可达性不能代替底层 direct / DERP 测量。

例：1,000 人每人每月观看 10 小时，平均 2 Mbps，假设 20% 观看时长走 TURN：`1000 × 10 × 0.45 × 2 × 20% = 1800 GB`；若免费额度完整可用，则 `max(0, 1800 - 1000) × $0.05 = $40/月`。同条件平均 5 Mbps 为 4500 GB、$175/月。20% 是说明用假设，不是 Cindy 或 BotHarness 的实测中继比例；不同码率与路由相关时应分组统计。模型未包含服务端固定费、信令、图片回退、税费或终端流量费。

### Connect Tunnel 不等于免费媒体中继

ADR-0241 的公共 hostname Tunnel 与 Realtime TURN 是两项不同服务。Cloudflare Tunnel FAQ 明确公共 hostname 经 reverse proxy，Free / Pro / Business 的视频及大文件服务须使用相应付费产品；私有网络路由是另一种情形。不能把“Tunnel 文档未列每 GB 价格”解释成“可免费无限转发远控视频”。现有低频 JPEG 诊断／回退与持续图片流的具体适用性，本次没有获得服务商确认，不能直接判定违规，也不能认定 Base64 封装豁免限制。[Tunnel FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/#large-file-and-streaming-traffic-through-tunnel)。

### 对 Q8 的修订推荐，尚未获 Human 接受

建议由此前 B（仅尝试直连、失败图片）调整为 **C 的受控范围：直连优先、按需托管 TURN、图片兼容回退**。费用本身不足以成为排除 TURN 的理由；先验证可用性和实际平均流量，不自建全球 TURN 机群，也不默认新增 SFU。托管 TURN 不保证任何网络都能连通，图片路径仍需存在。

在 DSH 架构中，Computer Plugin 继续持有观看授权、控制权及媒体销毁；现有 Connect 承载鉴权和信令，托管 TURN 单独承载加密媒体。云端凭据服务仅在获准的请求下签发短期 TURN 凭据，服务商长期密钥留在服务端；费用额度不成为另一套 Computer 控制权。Cloudflare 提供短期凭据签发与撤销 API，但实际的额度检查、限流、并发预算和停用规则需要 BotHarness 自己实现，不能假设开一个账户就自动获得硬费用上限。[凭据 API](https://developers.cloudflare.com/realtime/turn/generate-credentials/)。

Human 尚未选择 Q8；本次未开通付费服务、未获取凭据、未部署或变更运行时。

## 免费开源项目的运营边界：后续追问

Human 进一步提出：功能不收费时，项目能否承担公共媒体中继。此前“小规模受控测试可承受”的结论不能外推成无限量公共服务；支持 TURN 协议与由 BotHarness 为全部用户支付 TURN 账单是两个独立决定。

同一价格模型下，1,000 人每天观看一小时、每月 30 天、实际平均 2 Mbps，全部走一次计费中继时为 27,000 GB，扣完整免费额度后约 $1,300/月；若中继时长占比为 20%，约 $220/月。均未计协议开销和其他服务。持续挂机、高码率、多观看者与凭据滥用会进一步增加流量，不能只靠正常用户的平均值规划最坏支出。免费额度属于供应商账户；所有用户共用项目账户时，不会每新增一位用户就新增 1,000 GB 免费额度。

Cindy 官方定价同时提供免费客户端、付费托管模型服务以及团队／企业产品。因此它有商业服务，但公开资料没有给出模型业务利润、补贴媒体的金额、远控中继额度或运营盈亏；不得把“模型服务补贴远控”写成已证实事实。后端未包含在公开仓库，也不能因为客户端未见计费判断就断言服务端无限量免费。[官方定价](https://cindy.app/pricing)、[仓库边界](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/README.md#L70-L76)。

进一步核查的官方条款开头明确运营方为 XD Entertainment Pte. Ltd. 及关联方；§2.1 要求 Device Link / remote access 使用账号登录，未在该条规定付费订阅门槛。因此能确认公司运营与账号服务依赖，不能确认媒体资金来源。[官方条款](https://protocol.xd.com/cindy/agreement-1.0.html)。

定向审查 controller、index、Screen、协议、ICE resolver 和文档中的 quota / billing / subscription / credit / paid / paywall 等关键词，未找到远控累计 GB/月预算或模型积分扣除。可确认单个被控 Host 只有一个 active lease，另一个 start 遭 `DESKTOP_BUSY` 拒绝（明确 takeover/resume 除外）；JPEG 有单次在途、250ms Host cadence 和大小限制。这些是并发／资源限制，不是费用硬上限。后端未公开，搜索无结果不能证明后端没有额度。[lease](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/main/remote-desktop/controller.ts#L180-L202)、[并发拒绝](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/main/remote-desktop/controller.ts#L831-L837)、[JPEG 限制](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/main/remote-desktop/controller.ts#L1207-L1228)。

建议明确开源能力与托管服务的边界：软件完整支持直连和配置 TURN；默认不依赖项目出资的无限中继，用户可配置自己的托管账户或自建服务。官方公共 TURN 若提供，应是另行决定的有总预算、有个人额度、有停用机制的服务。客户端开源可被修改，付费资源限制必须由可信的服务端与中继执行；仅限制前端码率或凭据 TTL 不能保证账单上限。停止 TURN 后也不能无限转往项目承担的 JPEG relay，否则没有封住支出。

这是待 Human 选择的运营建议，不是已接受的产品范围或部署动作。

后续确认：Human 已接受“支持 TURN，但首版不由项目承担公共 TURN 流量”，允许用户自配中继。此前未决文字保留为讨论记录；当前范围以 [设计访谈 Q8](2026-10-22-local-computer-viewer-design.md) 为准。Human 另提出 VDO.Ninja 作为候选，正在研究其 SDK 与托管服务边界，尚未选择依赖或公共服务。
