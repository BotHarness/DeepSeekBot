# 手机埋点验收 handoff — #2682

本任务按 Human 指示先合并源码，再交共享设备 runner。**真机操作和原生 PostHog 回读尚未通过，不能据此打开正式采集资格开关。** 本片无原生依赖或配置变化；仍需核对当前 main 与已安装二进制的原生兼容性。Release 构建的 JS 必须重打包；Metro 重载不改变已有 Release 包。

## 先验证现有五类事件

1. 按 [共享设备队列](device-qa.md) 和 [Android 流程](android-device-qa.md) 接受 owner-cut 批次。使用专用 QA Host，保留 Human 已有数据、配对与设置。iOS 使用自己的队列，不将 Android 结果冒充 iOS 验收。
2. 将指定候选构建配置为 `EXPO_PUBLIC_MOBILE_TELEMETRY=qa`、该项目的公开 `EXPO_PUBLIC_MOBILE_POSTHOG_TOKEN` 和新生成的 UUID v4 `EXPO_PUBLIC_MOBILE_TELEMETRY_QA_RUN`。项目为 **648269 / DeepSeekBot / Asia/Shanghai**。不用 personal API token，不设置 `EXPO_PUBLIC_MOBILE_TELEMETRY_QUALIFIED=true`，不修改生产开关。QA tag 必须在打包时进入 JS；仅给已运行的 Release 进程加环境变量无效。
3. 开启该手机统计，记录平台、真实 app version/build、测试时间和 QA UUID。已有安装不清数据；若需重置首激活标记，显式关闭再开启统计会换随机统计身份并清队列，应记录这个行为。先用无效粘贴链接验证一次拒绝，再用新测试 offer 配对；成功需 saved-Host 与实时 Roster，非 socket 连上或缓存列表。
4. 在前台 DM 发送一条无私密内容的测试消息，等待 Host 接受并观察到新的 Bot 消息。这个步骤需要可用模型。期望：`app:app_open`、`pairing:attempt_start/complete`、`connection:attempt_complete`、`onboarding:activation_step_complete` 的 host_ready/message_accepted/bot_message_observed。结果入库顺序可能交错，不强求同毫秒事件的先后。
5. 使用 PostHog MCP 按本次 QA UUID 回读，比较本地已脱敏出站 UUID 与字段；记录缺失、重复、实际等待时间。HTTP 200、Node SDK 测试或合成事件均不能代替此步。没有模型、连接失败或没收到事件时保留失败证据，不改成通过。

```sql
SELECT uuid, event, timestamp, properties
FROM events
WHERE timestamp >= now() - INTERVAL 1 DAY
  AND properties.source = 'mobile'
  AND properties.qa_run_id = '<本次新 QA UUID>'
ORDER BY timestamp
LIMIT 100
```

## 再验证创建和导入

使用 [phone-bot-create](../../.agents/skills/verify-deepseekbot/features/phone-bot-create.md) 的真实入口与 CLI 回执证明，覆盖 blank/Git/Zip/Marketplace。只用任务自有、无秘密的 fixture；不要导入未知仓库或上传个人文件。无需模型即可创建。

| 操作                           | 新事件期望                                             | 产品事实                                      |
| ------------------------------ | ------------------------------------------------------ | --------------------------------------------- |
| 预览 Git/Zip/商城              | started + result，phase=preview，outcome=preview_ready | 原 Host 返回已核验来源                        |
| 创建/导入并快速双击            | 一对 submit 事件，kind 区分四来源，结果 created        | 正确 Host 新增一个 Bot 和原始 DM              |
| 响应丢失后恢复                 | 原 submit 为 unknown；下一 recover 为 recovered        | 同一 operation key、Bot 和 DM，没有第二个 Bot |
| 仅查到 reserved / 尚无回执     | pending，不能标 created                                | 产品仍显示可继续的状态                        |
| 设备撤销、过时来源、未预览提交 | refused + 原因枚举                                     | 无跨 Host 回退或静默换来源                    |
| 离开页面、返回已展示完成状态   | 不因渲染/重复回调再记成功                              | 导航保持原有行为                              |
| 已确认完成后重启               | 不补记旧完成事件                                       | 原 Bot 可见                                   |

故障注入只在 runner 管理的任务 fixture 上进行；无法在真机注入时明确记未测试，引用自动化覆盖，不模拟成设备通过。进程重启后的未确认完成记录可再次产生 recovered 观测；这是恢复次数，不能算新建数或唯一业务操作数。每个 preview/submit/recover 使用独立随机 attempt_id，开始和结果的该值必须相同。

## 关闭、隐私与文案

- 离线关闭统计，再操作/恢复/重启，确认无后续统计请求；开启后使用新身份，旧调用结果不补发。不要将关闭后的“没有新数据”当作自动证明，需要设备网络观测和按 UUID 的服务端核对。
- 检查序列化字段：无 Bot/Host/Channel/operation/listing ID、名称、仓库地址、commit、文件名/路径/hash、persona、聊天、原始错误、推送令牌或凭证。仅匿名统计 UUID、公共版本、粗设备事实与枚举/区间。服务端可能增加 `$sent_at`；协议禁用 GeoIP/person profiles 的字段必须保留。现有配对接收器、Computer 和其他会话资源不得改动。
- 首次说明和 Settings 展开详情：EN/ZH、浅/深色、默认/中间/最大字号，核对新增的 Bot 创建/导入用途和粗设备说明、可读性、链接与开关。按 UI 证据规范保留匹配的 base/head 截图；本任务未占用设备，没有截图通过声明。
- 生产前由官网 owner 发布 [mobile-statistics](../mobile-statistics.md) 的中英扩展隐私说明（关联 #2303/#950），并重新核对项目 IP 丢弃设置。不要把 repo 文档合并当作官网已发布。

## 返回结果

在 #2682 或本片 PR 留一份脱敏报告：候选/批次 SHA、原生包来源、平台/版本、QA UUID、开始/结束时间、每个步骤 pass/fail/untested、出站/入库数量与 UUID 比较、截图/日志证据和精确资源清理。分别列 SDK wire、原生操作、PostHog 回读、Human QA；缺失项保持开放。不要发送账号、密钥、设备序列号、Host 地址或私人截图。

本任务的单次合成 wire 检查已将 7 个事件（5 类）经真实 SDK 与代理发送并在 PostHog MCP 中逐 UUID 回读，字段一致，额外字段为 `$sent_at`。它使用 development 和专用 QA 标记，**不是手机、Host 或模型操作证据**；后续原生验收必须生成新 QA UUID。确切候选及证据见 PR/issue handoff。
