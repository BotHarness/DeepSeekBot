# Optional mobile statistics / 可选手机统计

## What the phone shares

Phone statistics are **on by default for new installations**. The first enabled launch shows the same informational notice pattern as the Web client: a short explanation, expandable details, Privacy / View source / Open Settings / Got it. Dismissal is remembered on the phone. This is an informational acknowledgment, not a pre-collection consent gate. The switch is at the bottom of Settings, with details collapsed until opened. Turning it off does not affect pairing, chat or notifications. A saved opt-out remains off across upgrades. This setting is separate from the computer's telemetry setting.

With statistics enabled, DeepSeekBot sends PostHog a random phone statistics identifier, public app version/build, iOS/Android, supported language and coarse results for opening the app, pairing, connecting and the first accepted chat/observed Bot message. No names, messages, Memory, files, pairing links, credentials, push tokens, Host identity or other product identifiers are included. We do not connect this ID to website visits, accounts or computers, and do not create person profiles.

Turning statistics off clears the phone identifier and unsent events. Turning it on again creates a new identifier. Events already received cannot be recalled by this switch. Queued events expire after 24 hours. OS backup restoration may restore the phone's saved consent and identifier; a clean install without restored app data uses the enabled default. Unreadable preferences fail closed rather than replacing a possible opt-out. A failed save shows a notice and pauses statistics for the current launch; retry to save your choice durably.

Events go through our first-party proxy to PostHog Cloud US. Network services receive an IP address while handling the connection; PostHog's project is configured to discard it, and these events disable GeoIP. We use these statistics to improve pairing, connection reliability and first-chat usability. They describe **anonymous installations with statistics enabled**, not all Humans or task success.

Source: [Mobile Telemetry](../apps/mobile/src/telemetry/) · [decision and qualification limits](adr/0214-mobile-statistics-use-explicit-consent-and-an-independent-install-id.md).

## 手机会分享哪些信息

手机统计**新安装默认开启**。首次启用时沿用 Web 客户端的说明方式：简短提示、可展开的详细说明，以及隐私说明、查看源码、打开设置和知道了。手机会记住已读状态。这是信息告知，不是采集前的同意门禁。开关位于设置页最底部，详细说明默认折叠。关闭不影响配对、聊天和通知；已有关闭选择在升级后保留。这个开关独立于电脑端统计。

开启后，DeepSeekBot 向 PostHog 发送随机手机统计标识、公开应用版本和构建号、iOS/Android、支持的语言，以及打开应用、配对、连接、首次发送被接受和观察到 Bot 消息的粗略结果。不发送名称、聊天、Memory、文件、配对链接、凭证、推送令牌、电脑身份或其他产品标识。不将手机标识与网站访问、账号或电脑关联，也不建立个人档案。

关闭后清除手机标识和未发送事件；再次开启生成新标识。开关不能撤回服务端已收到的事件。待发事件最多保存 24 小时。系统备份恢复可能恢复已保存的同意状态和标识；不恢复数据的全新安装默认开启。读取已保存设置失败时暂停统计，不覆盖可能存在的关闭选择。保存失败会显示提示，本次运行暂停统计；请重试以永久保存选择。

事件经自有代理发往 PostHog 美国云。网络服务处理连接时会接触 IP 地址；PostHog 项目配置为丢弃 IP，手机事件也禁用 GeoIP。数据用于改善配对、连接和首次聊天，只代表**已启用统计的匿名安装**，不能代表全部用户或任务成功率。

## Maintainer configuration

The checked-in build remains unconfigured. Environment variables are public bundle configuration, never personal API keys:

- `EXPO_PUBLIC_MOBILE_TELEMETRY=qa`
- `EXPO_PUBLIC_MOBILE_POSTHOG_TOKEN=<public project ingestion token>`
- `EXPO_PUBLIC_MOBILE_TELEMETRY_QA_RUN=<fresh UUID v4>`

Only iOS/Android send; web preview never sends. Added `expo-device` and `expo-application` native modules require a new development build through the shared QA queue; Metro reload alone is insufficient. Production requires `EXPO_PUBLIC_MOBILE_TELEMETRY=production`, the public token, a physical release build and `EXPO_PUBLIC_MOBILE_TELEMETRY_QUALIFIED=true`. Set that flag only after all release gates below, including the first-use notice and published mobile privacy copy. As in the Web client, collection does not wait for notice dismissal. This does not introduce or claim legal terms acceptance. Test/Simulator/unconfigured builds must not use production configuration. Do not use a personal API token in Expo public variables.

## Analysis definition

Project **648269**, timezone **Asia/Shanghai**. Base cohort: `properties.source = 'mobile'`, `schema_version = 1`, `environment = 'production'`, no `qa_run_id`. Segment by platform, public app version/build and language. Count distinct `distinct_id` as installations with statistics enabled, never people; separate `mobile_app_opened.paired_host_count_bucket = '0'` from returning paired installations.

- Pairing: starts vs results by `attempt_id`, method, outcome and bounded reason. Missing outcomes may mean process termination, TTL/overflow or transport loss; do not equate them with a product refusal.
- Connection: `ready / all completed observation episodes`, segmented by trigger, bounded credential-refusal reason and retry bucket. Timeout ends only the observation, not Host reconnection. `recovery` is a new episode. Use duration buckets, not invented exact latency.
- Activation: ordered `host_ready → message_accepted → bot_message_observed` by distinct installation. The final step requires a successful mobile send in the foreground conversation. It is not proof of a causal reply, model success or completed task. Use a separately labelled returning-install view; enabling statistics on an existing install does not make it a new product installation.
- Deduplication: compare unique event UUID and attempt ID counts. The owner emits once per activation and preserves retry UUID; server acceptance/readback must still be measured.

Do not add Host and mobile message totals together or estimate non-consenting usage.

## Runnable device acceptance

Submit the PR + exact SHA to the shared-device queue. Do not start a separate Simulator or reuse another session's Host. Use an isolated real Host and a new QA UUID; record platform, build, start/end time and project timezone without credentials or device identifiers.

1. Clean app data only in the authorized QA lane. Verify the first-use informational notice, localized privacy/source links, Open Settings and Got it; dismiss and restart to prove it stays dismissed. Collection is default-on and does not wait for dismissal. Explicitly turn it off at the bottom of Settings, then pair/chat/restart and verify zero analytics requests. Verify saved opt-outs survive upgrades.
2. Enable statistics from Settings while offline; return online, paste a malformed link, then scan a valid QR. Repeated scanner callbacks make one attempt. Test an expired/used code, unreachable route and explicit retry. Force the injectable persistence failure in automated tests; real storage failure needs a controlled device test, not corruption of user data.
3. Expected successful path: `app_opened → pairing_started → pairing_result(success) → connection_result(pair,ready) → activation(host_ready) → activation(message_accepted) → activation(bot_message_observed)`. Connection can race pairing-result delivery after the saved-Host commit; compare semantic boundaries as well as timestamp order. Test both DM and group.
4. Keep a cached conversation, restart and reconnect: history and drafts do not advance activation. Send with network failure, then retry/reconcile the same outgoing message. Cover the chat, background the app and replay stream frames: none creates a Bot observation. Switch Hosts: no new installation or duplicate activation.
5. Disconnect for >30 seconds, observe timeout, restore connectivity and observe one recovery-ready episode. Exercise manual retry, credential refusal, background cancellation and resume. Short permission dialogs keep the foreground-session ID; >30 minutes background renews it.
6. Disable statistics while offline and while a batch is pending. Inspect local identity/queue deletion, no later sends, and a new random identity after re-enable. An already received request cannot be undone. Test restart, clean reinstall and OS restore separately.
7. Read back only the QA UUID in PostHog. Compare ordered event UUIDs/properties with the local sanitized capture, elapsed ingestion delay, missing rows and duplicate UUIDs. Look for any extra SDK properties, IP or person processing. The adapter's Node wire test alone does not prove device networking.

Evidence table for each candidate: automated | Metro exports | Simulator UI | physical iOS | physical Android | tagged PostHog readback | public website privacy copy | Human QA. Mark unrun explicitly. The shared Mac currently has no Android device. No dependent telemetry ticket or production flag is released until #1935 Human QA is accepted.

## Website privacy copy handoff (#950)

The English and Chinese sections above are the proposed mobile addition to `/en/privacy` and `/privacy` in the separately owned product-site repository. Publish them through that owner's review flow before production enablement. This repository change does not claim the website has been updated.

## Human-directed UX revision (2026-10-16)

The Human replaced the earlier explicit-opt-in design in #1929 with default-on statistics, collapsed explanatory text, and one switch at the bottom of Settings, then directed us to reference the Web client. Verified Web behavior is a one-time informational notice, not terms acceptance or a collection gate. Mobile now follows that pattern with phone-specific copy and the same localized privacy URLs. No statistics control appears on pairing. Checked-in builds remain unconfigured; physical device, PostHog readback, public mobile privacy copy and Human QA remain release gates.
