# Tobs／托布品牌迁移方案

日期：2026-10-24（Asia/Tokyo）。状态：品牌与兼容原则已由 Human 确认；本文是执行方案，不代表已部署、发布或完成商店审核。

## 已确认的目标

- 应用 DeepSeekBot 更名为 **Tobs／托布**，意为 Team of bots，也寓意 Thousands of Bots；内置管家继续叫 **Tob**。框架和主仓库保留 **BotHarness**。
- 官网主域采用 `tobs.app`。旧官网域名继续持有、续费和提供 HTTPS，永久跳转到新站对应页面。
- 新短链采用 `go.tobs.app`，旧 `go.botharness.ai` 入口继续兼容；短码、Campaign、点击统计与管理权限沿用原数据。
- 手机应用保留既有应用身份、商店记录与升级链路，只迁移公开品牌和相关链接。
- 提供 `tobs` 安装及 CLI 入口，保留 `deepseekbot` 安装、命令和旧链接兼容。具体包发布形式受 npm 可用性与发布验证约束。

术语以 [CONTEXT.md](../../CONTEXT.md) 与 [CONTEXT.zh.md](../../CONTEXT.zh.md) 为准；持久兼容边界见 [ADR-0248](../adr/0248-tobs-rebrands-the-product-while-preserving-existing-entry-points.md)。

## npm 名称核查

2026-10-24 直接请求官方 registry `https://registry.npmjs.org/tobs`，返回 HTTP **404**，响应为 `{"error":"Not found"}`。结论：核查时未发现已发布的 `tobs` 包。查询未使用发布凭据，未发布、预留或转移任何包。

404 不保证发布资格：保留名、安全规则、近似名称限制和查询后的抢注都可能影响发布。正式发包前再次核查名称、发布账户权限及可信发布配置。不要用空壳占位包代替经过验证的发布产物。

优先使用无 scope 的 `tobs`；若发布被拒，采用经确认拥有发布权限的 scope，例如候选 `@botharness/tobs`，其可用性和权限仍须核实。**npm 包名与 executable 名不同**：即使使用 scoped 包，仍可暴露 `tobs` 命令；文档中的安装命令必须使用实际发布包名。

参考：[npm package name guidelines](https://docs.npmjs.com/package-name-guidelines/)。

## 当前入口与目标

以下为本地源码配置快照，尚未核对 Cloudflare、App Store Connect、Google Play、Expo 和 Search Console 的线上状态。

| 范围        | 当前                                                                                         | 目标及兼容方式                                               |
| ----------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 产品官网    | `deepseekbot.app`                                                                            | `tobs.app` 提供内容；旧域逐页 301 到新域                     |
| 官网别名    | `www.deepseekbot.app`、`deepseekbot.dev`、`www.deepseekbot.dev`、`deepseekbot.botharness.ai` | 精确主机名匹配，一跳到 `tobs.app`；保留路径与 query          |
| 新 www 入口 | 尚未核对                                                                                     | 配置 `www.tobs.app` → `tobs.app`                             |
| 官网 Worker | `deepseekbot-site`                                                                           | 复用部署；内部资源名无需随公开品牌同时改名                   |
| 营销短链    | `go.botharness.ai`，Worker `botharness-links`                                                | 增加 `go.tobs.app`；两个域使用同一 Worker、D1 与短码         |
| 开发者站    | `botharness.ai`、`botharness.dev`                                                            | 保留 BotHarness；更新指向应用的名称和链接                    |
| 市场 API    | `market.botharness.ai`                                                                       | 保留；CORS 加入新官网 origin，保留合法旧 origin              |
| 连接服务    | `connect.botharness.ai`                                                                      | 保留，不与官网重定向混用                                     |
| 设备隧道    | `deepseekbot.dev` 下的设备子域                                                               | 保留原 DNS、路由和连接协议；禁止通配重定向                   |
| 遥测        | `t.botharness.ai`                                                                            | 保留原服务和历史数据，更新隐私文案与站点配置                 |
| 主仓库      | `BotHarness/BotHarness`                                                                      | 保留                                                         |
| 官网仓库    | `BotHarness/deepseekbot-site`                                                                | 可后续改为 `tobs-site`，不作为官网切换前置；具体更名尚待确认 |

官网源码位于相邻 `deepseekbot-site` checkout：`wrangler.jsonc`、`worker/index.ts`、`vite.config.ts` 及 `scripts/docs.ts`、`scripts/blog.ts`、`scripts/changelog.ts`。主仓库相关入口为 `packages/links/src/redirect.ts`、`packages/links/wrangler.jsonc`、`packages/links-cli/src/config.ts`、`packages/market/src/public-api.ts`、`packages/ingest/src/worker.ts`。

## 实施顺序与验收

### 1. 建立迁移基线

核对 `tobs.app` 所在 Cloudflare account、zone、DNS 接入及证书状态；盘点线上 Worker 路由、Access 应用、D1 绑定和发布版本。保存脱敏配置及恢复步骤，备份短链数据库。记录旧站 sitemap、重要落地页、下载和隐私页面、Search Console 属性、流量及短链计数基线。

核对 Apple／Google 商店当前发布状态、Tobs 名称可用性、本地化名称限制、Expo 项目归属，以及 npm 发布权限。域名购买和 npm 查询都不等于商标或商店名称可用性确认；本方案不作商标法律结论。

完成标准：每个待变更入口都有 owner、线上现状、目标、验证方式和恢复点。实施 issue 按仓库工作追踪规则建立并认领；本方案不创建或占用发布身份。

### 2. 交付第一条可验证路径：新官网与一个旧页面

先让 `tobs.app` 在现有官网 Worker 上正常提供完整内容并取得有效 HTTPS；保留旧站服务。准备更新品牌名称、标题、logo/分享图文案、canonical、hreflang、sitemap、robots、结构化数据、站内链接和下载指引。保留原有中英文路径布局，避免同时重做导航、内容结构和部署平台。

为新 origin 配好市场 CORS 及所有实际使用的登录／回调白名单。先用隔离预览验证一条旧文档 URL 到新页面的行为，确认后才整体切换生产 canonical 和旧域跳转。预览环境维持不索引，生产移除预览用 noindex。

完成标准：新站首页、中文／英文文档、市场、隐私与下载入口可用；指定旧页面一次 301 到相同路径和 query 的新页面；无循环、无跳首页替代、无资源跨域失败。随后向 Human 展示实际可操作页面，再扩展全量迁移。

### 3. 切换官网与搜索入口

旧官网所有已知精确主机名直接 301 到新 canonical；`www.tobs.app` 同样归一。保留查询参数及已存在页面锚点所需的页面结构；URL fragment 不会发送到服务器，需在浏览器实测带锚点链接。缺失页面保持正确 404 或有意义的替代映射，不能因 SPA fallback 误报所有 URL 为有效首页。

验证 Search Console 新旧属性所有权，提交新 sitemap；对适用的整站域名迁移提交 Change of Address。旧域涉及不同业务子域时先确认属性与迁移范围，不能把设备连接域一起申报为官网搬迁。持续观察旧站抓取、新站收录、404、重定向链与搜索流量；永久跳转不能保证排名立即稳定。

旧域按已确认原则持续保留，不设置自动删除日期。参考 [Google 站点迁移指南](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)。涉及现有 SEO 项目、报告与排名跟踪时，沿用 [SEO AX adapter](../agents/seo-ax.md) 的共享工作流，不另建重复跟踪项目。

完成标准：从旧 sitemap 抽取及枚举的迁移 URL 均落在正确新页面；canonical／hreflang／sitemap 一致；Search Console 所需提交已有记录，收录观察作为后续跟踪项而非当天上线阻塞。

### 4. 迁移短链与其管理入口

`botharness-links` 增加 `go.tobs.app` 绑定，继续使用原 D1；修改官网目标 origin 为 `https://tobs.app`，生成短链 origin 为 `https://go.tobs.app`。两个域的同一 slug 都直接解析到新官网，保留现有营销短链 302 语义；不要先跳新短链域再跳官网，以免重复计数或多一次网络往返。

同步管理 UI、API 响应、OpenAPI servers、MCP 文案与返回值、`bh-links` 默认地址和帮助。旧 API／MCP／CLI 自定义 URL 继续受支持，POST 请求不依赖跨域 301 转发。保留旧 Access 配置，在新域完成等价保护后才开放管理入口；核实新旧域的 PAT 验证与权限相同。登录 cookie 不能假定跨域继承。

完成标准：同一现存短码通过两域访问，都返回新官网目标及相同 UTM；历史 Campaign／短码／计数没有重建；单次人工点击符合既有计数语义，预览机器人过滤仍有效；新域能创建一个测试短链，旧域同样解析它；未认证访问管理/API 得到预期拒绝。测试标记与计数写入前应使用隔离数据或指定测试 Campaign。

### 5. 发布应用品牌更新，保持安装身份

沿用 iOS Bundle ID 与 Android package `app.deepseekbot.mobile`、现有 App Store Connect 记录、EAS 项目、签名、App Group、推送凭据和用户数据位置。开发版身份也保持兼容。iOS 上传构建后不能更改既有记录的 Bundle ID，见 [Apple App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/)。

更新手机桌面显示名、应用内中英文名称、系统权限说明、通知／分享扩展可见名称、帮助与隐私 URL；核对图标、启动画面与截图是否包含旧品牌。商店更新名称、副标题、介绍、关键词、截图、预览、营销 URL、支持 URL、隐私 URL 与审核备注，按平台和 locale 实际限制填写。保留已有购买、订阅与推送身份（如存在）。

当前配对 scheme `deepseekbot:`／`deepseekbot-dev:` 和基于 applicationId 的 OAuth 回调继续支持；新品牌 scheme 只有在确认无冲突、接收器与生成器都实现且完成兼容测试后才新增。生成新的配对链接必须考虑旧客户端能否打开，不能只替换字符串。

配置入口：`apps/mobile/app.config.js`、`app.json`、`eas.json`；配对与登录入口：`src/host/pairing.ts`、`native-connect-account.ts`；文案：`src/ui/strings.ts`。当前 OTA 关闭，名称与原生配置更新要经过新原生构建和商店发布。

完成标准：从已安装旧版升级到新版后，本地连接、登录、Bot 数据和设置延续；旧二维码／深链可用；登录回调、推送、通知扩展、分享及隐私链接逐项验证。按共享设备 QA 流程完成真机测试，再经 TestFlight／内部测试到正式商店发布。仓库内 app ID 不证明已经正式上架。

### 6. 发布 npm 与 CLI 兼容入口

本次目标版本为 **1.5.0**。Tobs 是正式产品与默认安装入口，发布并验证 registry 产物后，新用户统一使用 `tobs`；`deepseekbot` 只保留旧用户与脚本兼容。随后更新官网全部安装命令、按钮、教程和中英文品牌文案，移除 DeepSeekBot 品牌的旧 i18n 文案；旧名称只在必要的迁移说明和兼容标识中保留。官网默认入口切换不得早于 npm 验收完成。

发布前再次确认 `tobs` 可用；以同一实现提供新旧命令，避免两个独立产品或状态目录。优先评估单一实现包与薄兼容入口，核实 package bin 的全局安装冲突、Windows shim、npx、卸载一个入口后另一个是否仍可运行。不要让两个包不受控地争用同名 executable。

保留 `deepseekbot` 包及旧版产物；兼容包应绑定已验证的实现版本，不使用浮动依赖把旧命令行为变成不可复现。明确两个安装入口如何升级、共存与卸载。用户目录、环境变量、配置键、日志归属、插件／Bundle 注册身份和存储标识均先保持兼容，不做品牌字符串全局替换。

执行时核对真实包结构与 DSH 当前发布机制，沿用 `dsh-plugin-dev`、`dsh-dev` 和版本政策；完成发布后才更新 `scripts/install-release.json` 及生成安装文档，并同步官网发布身份。新命令不得绕过旧命令的审批、确认 flag 或 coded refusal。

完成标准：全新安装、旧版升级、新旧命令调用、两包共存和卸载路径均使用同一配置与数据；版本、JSON stdout、退出码、权限拒绝保持一致；真实 Host 验证通过。仅在 registry 中的实际产物通过资格验证后，将新安装入口设为默认。

### 7. 收尾仓库及外部资料

主仓库与 GitHub organization 保留 BotHarness。官网仓库若决定改为 `tobs-site`，单独验证 Git remote、Actions、Cloudflare 集成、徽章、原始文件链接、webhook、发布凭据和历史链接；GitHub 页面跳转不能代替所有集成兼容性验证。旧路径不复用给另一项目。

更新 README、产品站、开发者站应用入口、发布说明、社区简介、支持资料、插件目录和第三方分发入口中的公开品牌。第三方平台上的 DeepSeek 模型／DeepSeek Harness 官方名称仍保持准确；历史发布记录保留历史事实。公开支持邮箱若依赖旧域，先保持收件兼容，再决定是否增加新别名。

每个实现 PR 按仓库要求提供双语 change fragment、相应 CLI／文档、风险分类及 UI 证据；本讨论文档本身不宣称迁移功能已经发布。

## 回滚与放行条件

| 范围     | 回滚方式与限制                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 官网     | 保留前一 Worker 版本及旧资产。新域出现故障优先恢复其可用内容；301 可能已被缓存，不能立即把新域反向跳旧域，否则可能循环。canonical 与路由恢复必须协调，已提交的搜索迁移按当时状态处理 |
| 短链     | 恢复目标／生成 origin 配置，保留双域与原 D1；不要用旧数据库快照覆盖迁移期间新建短码及点击                                                                                            |
| 手机     | 停止分阶段发布并提交修复构建；已升级用户通常不能靠服务器降级原生包，需前向修复。保持身份使旧版仍可连接                                                                               |
| npm／CLI | 保留已验证旧版并按发布政策修正 dist-tag 或发布修复版；不删除已发布版本，不迁移用户数据目录                                                                                           |

放行前必须记录实际域名解析与证书、代表 URL 的状态码／Location、短链计数、跨域与登录验证、旧版客户端兼容、CLI 安装矩阵和应用升级证据。故障先按组件收敛，不同时回滚所有服务。

## 尚需线上核实的事项

2026-10-24 首批实施补充：线上另有 `go.deepseekbot.app` 短链域，加入兼容集合。后台暂以该域为 `ADMIN_ORIGIN`；新旧其他短链域的后台 GET/HEAD 跳到原受保护后台，变更请求拒绝转发。公开短链、API 与 MCP 仍在各自域直接处理。新后台域的 Access 迁移留待等价策略可核实时进行。

- `tobs.app` DNS／Cloudflare account 与证书状态；`go.tobs.app` Access 保护。
- npm 发布资格及实际可发布名称；App Store／Google Play 名称、当前上架状态与审核要求。
- 当前 Search Console 属性权限、实际索引范围与 SEO 项目基线。
- 所有线上 OAuth／CORS／邮件／webhook 白名单和第三方产品目录。
- 官网仓库是否更名，以及最终品牌图形素材是否需要调整。

这些是执行前检查或剩余范围选择，不阻塞已确定的兼容方案。实施顺序为：基线 → 官网可用路径 → 官网切换 → 短链切换 → 应用更新与 CLI 分别验证发布 → 外部资料收尾。每个阶段独立留证、独立放行。
