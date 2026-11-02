---
Status: Accepted
Date: 2026-11-03
---

# Bot network participation is controlled by Host and Bot

This accepted design refines [ADR-0277](0277-cross-host-bot-dms-use-online-communication-without-outgoing-queues.md)'s automatic collaboration within verified networks. Each Host and each PersonaBot has an Owner-controlled participation switch, defaulting on. Either switch being off prevents both initiating and receiving cross-Host Bot communication for the affected Bots. This is a design decision, not a claim that these controls have shipped.

## Why

Users normally expect Bots on their eligible network to find and contact colleagues. Default-on preserves that behavior, while explicit controls let an Owner isolate a Host or a Bot. Network reachability alone must not bypass an explicit off decision. Separate discovery and communication switches would introduce hidden-but-contactable states and confusing exceptions for cached contacts.

Default-on deliberately retains first-contact exposure to eligible peers while enabled. These controls do not replace authenticated membership, Host key verification, receiving Bot execution permissions or private Memory boundaries. They are not an emergency stop for accepted work.

## One participation decision, two levels

- A Host switch belongs to one Host identity/Profile, not the physical machine. Other Hosts on that machine remain independent.
- Each Bot also has a switch. Its effective participation requires both its own switch and its Host's switch to be on. Only the Host Owner can modify either; local or remote Bots cannot enable themselves.
- Both switches default on for new records and existing records with no explicit preference. Explicit choices persist across restarts and upgrades. Turning a Host off does not rewrite its Bots' preferences; turning it on restores eligibility according to those preferences.
- Only cross-Host Bot communication is affected. Same-Host Bot collaboration, Human-to-Bot chat and Human-device remote access remain independent.
- There is no separate discoverability switch or additional Channel participation switch. Disabled Bots are omitted from current remote directory results and cannot send or receive cross-Host messages. A disabled Host stops advertising Bot network participation. Previously disclosed information cannot be erased from another Host's cache.
- Within existing eligible scopes, enabled Hosts can contact one another without a new first-contact approval step. The Owner can additionally block a specific remote Host from querying the local Bot directory or sending messages. Existing ordinary-LAN mutual key admission remains required.

For a message from Bot A on Host A to Bot B on Host B, both Hosts and both Bots must be enabled, and existing membership, peer-blocking and message authorization checks must allow communication. Knowing an address, Bot identity or Channel ID, retaining a cached contact, or having an existing DM does not grant an exception.

## Stable tools, current authorization

Model-facing tool definitions remain unchanged across switch changes to avoid invalidating prompt-cache reuse. The tool remains callable, but execution checks current participation and returns an explicit coded refusal when disabled. Hiding a contact or changing a Client control is not enforcement.

The application-defined Bot network capability owns the shared participation decision. Tools, contact queries, outbound sends and inbound adapters consume the same authority; Tailscale, Connect, LAN and future fallback paths cannot bypass it. Settings are durable application data in the existing Operational Database, not native SessionEvent history or a second transport-owned store. Host and Bot identities scope the settings; transport routes do not.

The owning Plugin/Fiber applies lifecycle changes after settings commit. Host-off stops Bot network advertising and dedicated listeners; shared Human-device listeners remain available but refuse Bot operations. Bot-off filters that Bot while preserving permitted siblings. Authenticated Owner UI and CLI commands consume the same application Service through the existing Host boundary. No new DSH API or concrete method name is prescribed here.

Recheck authorization at the send and receiver admission boundaries, including after asynchronous authentication. Refusals must not disclose a hidden Bot's private details. Tool calls created before a switch change are not grandfathered. A peer can claim to be enabled, but only trusted local policy and current authenticated protocol checks can authorize this Host's actions.

## Cutoff, accepted work and recovery

Switch-off is a communication cutoff, distinct from withdrawal of authenticated network membership in ADR-0277. It refuses new inbound messages and outbound messages, including replies, once the change takes effect. Previously accepted work, including work not yet started, continues under its existing local permissions. Do not invoke membership-withdrawal cancellation merely because participation is disabled.

The receiver's canonical admission boundary decides whether a message was accepted before cutoff. A switch cannot undo accepted messages, completed effects or bytes already transmitted. If transmission occurred but acknowledgement is lost, preserve the existing unknown outcome rather than claiming the message was rejected or retrying it.

History remains available. Re-enabling restores eligibility without replay, automatic retry, backfill or deferred reply delivery. A failed send needs a fresh attempt. Actual membership withdrawal, key changes and Bot lifecycle changes retain their existing independent authorization and recovery rules.

## Delivery and verification

Implement the smallest two-Host path with Owner settings, matching online CLI commands and persistence before expanding surfaces. Verify both directions for Host-off and Bot-off, permitted sibling Bots, unchanged same-Host/Human paths, stable tool definitions, stale calls and cached contacts, alternate routes, restart persistence, accepted work continuing with replies refused, and no replay after re-enable. Distinguish previously accepted from not-yet-admitted messages in cutoff races. New admission must never rely solely on stale discovery data.

## 中文决策摘要

Host 与每个 Bot 各有一个默认开启、仅 Owner 可修改的 Bot 网络参与开关；双方 Host 和 Bot 都开启，且原有成员、屏蔽与消息权限检查通过，才可跨 Host 联系。Host 关闭不改写各 Bot 的设置，同机多个 Host 各自独立。关闭同时禁止主动联系和被联系，并停止当前目录披露；已有地址、缓存联系人或 DM 不能绕过，但无法抹掉对方已经获知的信息。不开设独立“可发现”或 Channel 开关，保留针对指定远端 Host 的屏蔽能力及普通 LAN 原有的双向密钥准入。

工具定义始终保留以维持缓存复用，实际调用与接收准入检查当前权限。Tailscale、Connect、LAN 与后续路线共享同一应用定义权限边界；设置归现有 Operational Database，UI 与 CLI 使用同一 Owner 命令。仅关闭跨 Host Bot 通信，不影响本机 Bot 协作、Human 聊天或 Human 设备访问。

关闭不是任务取消：此前已接收的工作继续遵循原权限，包括尚未开始的工作，但关闭期间不能发送后续消息或回复。真正撤销网络成员资格仍沿用 ADR-0277 的独立处理。重新开启不补发、不自动重试；接收准入之前或之后发生的关闭必须有明确边界，已发送但确认丢失仍可能是结果未知。默认开启保留便利性，也保留开启状态下对合格网络成员的首次联系暴露；本 ADR 不宣称功能已交付。
