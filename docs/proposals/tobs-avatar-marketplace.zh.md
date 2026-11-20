# Tobs 头像市场首版方案（修订版）

在现有 Marketplace 中新增 **Avatars** 分区。作者登录 Connect 账号后发布静态图片，图片可以来自本地文件，也可以是某只自己有权编辑的 Bot 当前存着的头像，并填写名称、标签和简介。浏览者无需市场账号，就能搜索、预览，再把头像**应用**到当前连接的 Host 上自己有权改头像的 Bot。市场显示 **Apply Count**（曾应用过该头像的 Bot 数），并为 Avatars 分区提供 Hot / New / Rising 三个榜单。

第一条完整路径走 Web。Tobs 对用户开放前，移动端用同一套验收再走一遍。

术语见 [GLOSSARY.md](../../GLOSSARY.md) 中的 Marketplace、Marketplace Avatar、Apply、Apply Count、Marketplace Ranking。关键取舍见 [ADR-0358](../adr/0358-apply-count-counts-persona-bots-without-anti-abuse.md)（按 Bot 计数，不防刷）和 [ADR-0359](../adr/0359-marketplace-avatar-images-are-processed-on-the-client.md)（图片由客户端处理，服务端只做低成本检查）。

本修订以 `main@e9d601ed3` 源码为依据，未启动 Host，也未在 Cloudflare 环境中验证。

## 已核对的主线能力

| 范围                  | 现状                                                                                                                                   | 本方案如何使用                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Marketplace Worker    | D1 `MARKET_DB` + R2 `MARKET_FILES`；Bot 有列表、搜索、详情、举报、管理员封禁和恢复、Hot/New/Rising 每日快照（`rankings.ts`）           | Avatar 条目复用同一个 Worker、存储、举报和榜单任务 |
| 作者身份              | 用 Connect 的 WorkOS token 鉴权，对外显示 Author ID                                                                                    | 发布时必须登录，作者信息只记在 Marketplace         |
| Uploaded Bot 生命周期 | 没有版本；作者删除是硬删除，回执一起删掉（`uploads.ts`）                                                                               | Avatar 条目采用同样的生命周期                      |
| 安装回执              | Host 尽力异步上报一次，失败不重试；按 SHA-256(Host ID) 去重（`receipts.ts`）                                                           | 应用回执照搬这套做法，去重键改为按 Bot（见下文）   |
| Bot 头像              | PNG/JPEG/WebP data URL，上限 128 KiB，校验文件签名（`persona-bot.ts`）；换图会清掉 Appearance                                          | 应用时调用同一个 Registry 写入接口                 |
| 改头像的权限          | Host owner 可以改所有 Bot；Bot 的拥有者可以改自己的 Bot；改别人的 Bot 需要 `bots.manageAll`，并写审计记录（`team/private-content.ts`） | 应用沿用这套规则；发布首版只限 Host owner          |
| 裁剪界面              | Web 有 `personabot-avatar-crop.tsx`；手机有 `pick-avatar-image.ts`，用系统 1:1 裁剪，输出 256 像素 JPEG                                | 输出尺寸改为 min(原图, 512)，最小 256              |
| CLI                   | 现有命令都叫 `marketplace-*`                                                                                                           | 新增一组 `marketplace-avatar-*`                    |

## 发布

0. **谁能发布**：首版只有 Host owner 能发布。发布桥接使用 Host 级别的 `connectAccount`，也就是 Host owner 的 Connect 账号；如果允许成员发布，署名会变成 Host owner。其他成员看不到发布入口；绕过界面调用会被 Host 拒绝。
1. **入口**
   - 从文件或相册选图。
   - 从 Bot 发布：入口在 Bot 资料页或右键菜单。只能发布 Host 上存着的头像图片，即用户上传的图片或 Appearance 渲染出的静态 PNG。默认 Blobatar 不能发布。Host owner 可以发布这台 Host 上任意 Bot 的头像。
2. **客户端处理**：两个入口都进入同一个裁剪对话框，由作者调整方形裁剪框。输出边长为 min(原图, 512)，小于 256 时提示「图片太小」并拒绝。重新编码为 PNG、JPEG 或 WebP 中的一种，去掉元数据，大小必须在 128 KiB 以内，超出就降低质量重新压缩。
3. **填写信息**：名称必填，最多 40 个字符；简介选填，最多 160 个字符；标签自由填写，最多 5 个，每个最多 24 个字符，大小写不敏感。确认页写明以哪个市场账号署名，并说明他人应用后的副本在删除或下架后仍会保留。
4. **一次提交**：图片、文字、授权确认和请求键在一个请求里提交。Worker 只读文件头和分块结构，检查签名、宽高（正方形，256–512）、不是动图、没有元数据块、不超过 128 KiB。任何一项不通过，按「未经处理」拒绝。通过后写入 R2 和 D1，条目立即公开。同一个请求键重复提交，返回同一个条目。不设草稿和暂存区。
5. **限流**：沿用 Uploaded Bot 现有的按账号上传限流。

## 生命周期与审核

- 文字可以编辑，图片不能改；换图就发布一个新条目。
- 作者删除：硬删除，计数和回执一起删掉。删除 Connect 账号时，同时删掉该作者的所有头像条目。
- 举报：使用同一张举报表，达到同样的阈值后自动隐藏为 `hidden_reported`。管理员可以封禁或恢复。
- 作者删除、账号注销、平台下架之后，各 Host 上已应用的副本都会保留，也不会向离线 Host 推送清除。

## 应用

1. 客户端从头像详情页打开 Bot 选择对话框。对话框只列出当前连接的这一台 Host 上、当前 Human 能改头像的 Bot。这台 Host 可以是本机，也可以是已连接的远端 Host。目标 Bot 的头像如果是可编辑的 Appearance，对话框会提示应用后 Appearance 会被替换。
2. 客户端只把条目 ID 和目标 Bot 发给 Host。由这台 Host 向 Marketplace Worker 取当前的图片，再用 Host 现有的头像校验检查一遍字节。写入前重新检查目标 Bot 和权限，然后调用现有 Registry 的头像写入接口：Tob 标记、换图通知和审计记录都和手动改头像一样。
3. Bot 上不记录头像来源，应用后的头像和本地上传的头像没有区别。
4. 写入成功后，Host 异步发一次应用回执，失败就算了（同安装回执）。
5. Web、手机和 CLI 都调用同一个 Host 命令。

## 计数与榜单

- **口径**：按 Bot 计数。同一只 Bot 重复应用、换走再换回来，仍计为 1；删除 Bot 或给它换头像，不会减少计数。从备份恢复后 PersonaBot ID 不变，仍是同一只；在另一台 Host 重新创建或单独导入，算另一只。
- **去重**：Worker 对 SHA-256(Marketplace Host ID + PersonaBot ID) 加唯一约束，拼接时要用不会产生歧义的编码。回执只包含条目 ID 和这个哈希值。
- **榜单**：Avatars 分区也有 Hot / New / Rising，定义和 Bots 分区相同，只是把安装数换成应用数，在现有的每日定时任务里一起生成快照。
- **可信度**：不防刷，也接受偶尔少计一次（见 ADR-0358）。如果以后要用这个数字发奖励或做其他重要用途，必须先重新评审。

## CLI

| 命令                                   | 作用                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `marketplace-avatar-list`              | 浏览或搜索（关键词、标签、榜单）                                           |
| `marketplace-avatar-tags`              | 列出标签及各自的条目数                                                     |
| `marketplace-avatar-detail`            | 查看单个条目                                                               |
| `marketplace-avatar-publish`           | 从文件（`--file`）或从 Bot（`--from-bot`）发布；CLI 也要满足同样的图片要求 |
| `marketplace-avatar-mine`              | 列出我发布的条目                                                           |
| `marketplace-avatar-edit`              | 只修改文字                                                                 |
| `marketplace-avatar-delete`            | 删除自己的条目                                                             |
| `marketplace-avatar-report`            | 举报                                                                       |
| `marketplace-avatar-apply --bot <bot>` | 应用到当前 Host 上的 Bot                                                   |

每条命令都要有中英文说明，满足 `pnpm lint` 的 CLI parity 检查。

## 第一条验收切片

使用独立的 DSH Web Host Profile，以及隔离的 Marketplace Worker、R2 和 D1 环境。准备两套作者身份 A 和 B；测试 Host 上准备两只 B 能编辑的 Bot（可以包含 Tob），一只 B 能看到但无权编辑的 Bot，再准备一台已连接的远端 Host，上面有一只 B 能编辑的 Bot。

| 操作                                                                                                                            | 可观察的结果                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A 从文件上传 PNG，裁剪后填写信息并发布                                                                                          | 预览和公开详情显示同一张裁剪后的图片；按标签能搜到；计数为 0；B 改不了、也删不了 A 的条目                    |
| 绕过界面直接提交：未裁剪的大图、带 EXIF 的 JPEG、动态 WebP、200 像素的小图、非正方形图片、超过 128 KiB 的图片、伪装成图片的文件 | 全部被拒绝，返回「未经处理」，D1 和 R2 都没有新增数据                                                        |
| A（Host owner）从 Bot 发布（一只用上传图片做头像的 Bot，一只用 Appearance 的 Bot）；尝试发布使用默认 Blobatar 的 Bot            | 前两只发布成功；Blobatar 的入口不出现或提交被拒绝                                                            |
| 同一台 Host 上的普通成员（即使有 `bots.manageAll`）尝试发布，包括用 CLI 绕过界面                                                | 看不到发布入口；CLI 返回权限拒绝；Marketplace 没有新增条目                                                   |
| B 预览并应用到 Bot 1                                                                                                            | Bot 资料页和列表显示新头像；重启同一台 Host 后字节不变；Marketplace 不可达时仍能读取本地头像；计数最终变为 1 |
| 重复应用到 Bot 1、换走再换回、再应用到 Bot 2；并发提交同一个请求                                                                | Bot 1 始终计为 1；应用到 Bot 2 后变为 2；并发请求不会多计                                                    |
| 在远端 Host 上应用到它的 Bot                                                                                                    | 由远端 Host 取图、写入并上报；计数加 1                                                                       |
| 用 CLI 应用到无权编辑的 Bot                                                                                                     | 返回权限拒绝，Bot 数据不变                                                                                   |
| A 删除条目；B 从之前打开的详情页再次尝试应用                                                                                    | 条目不再出现在搜索和榜单中；新的应用被拒绝；已应用的两只 Bot 保留头像                                        |
| 多次举报直到超过阈值；管理员恢复                                                                                                | 条目被自动隐藏；恢复后重新出现，计数保留                                                                     |
| 跑一次每日榜单任务                                                                                                              | Avatars 分区的 Hot/New/Rising 有快照，并按应用数排序                                                         |

同一切片还包括：

- 上面各个操作对应的 CLI 命令，用于读回应用结果和 Bot 资料，与 Web 使用同一台 Host 核对；
- CLI 命令的中英文说明；
- 头像网格分页的性能检查；
- 现有 Bots 浏览路径的回归检查。

移动端之后用同一套验收再走一遍：相册选图、系统裁剪、从 Bot 发布、Bot 选择、重启后读回、删除。上线前还要确认一件事：iOS 端的图片处理库能不能输出 WebP。如果不能，手机端统一输出 JPEG 或 PNG。

## 不在首版范围

- 分享可编辑的 Appearance 配方（以后作为另一种条目）；
- 修改条目的图片、图片版本；
- 在 Bot 上显示头像来源；
- 计数防刷和回执凭据；
- Skills 分区；
- Team 普通成员发布。首版只有 Host owner 能发布；成员用自己的 Connect 账号发布需要每个成员单独登录市场，和公开发布范围一起另行决定。
