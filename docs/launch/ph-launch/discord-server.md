# DeepSeekBot Discord 服务器配置

邀请链接：https://discord.gg/aEB2Ayhu7B
来的人主要是看了 X / YouTube / Product Hunt 的英文用户，所以频道名用英文，欢迎词和规则中英双语。

## 频道结构（建议照这个顺序建）

**📢 START HERE**

- `#welcome`：只读。欢迎词 + 官网 / GitHub / 安装三行（见下）
- `#rules`：只读。社区规则（见下）；可以设成 Discord 的「Rules Channel」
- `#announcements`：只读，Announcement 频道（别的服务器可以 Follow）。发版、更新日志
- `#roles`：只读。选语言角色（Onboarding 里设置就行，见「角色」）

**💬 COMMUNITY**

- `#general`：闲聊
- `#中文交流`：中文用户
- `#showcase`：晒你的 bot、头像、工作流
- `#avatars`：像素头像（BotPixel），晒名字生成的头像

**🛠 SUPPORT**

- `#install-help`：Forum 频道。安装、DSH 配置、模型服务商问题。Tags：`desktop` `cli` `model-provider` `solved`
- `#bugs`：Forum 频道。提 bug 前先搜；正式的请到 GitHub Issues。Tags：`lark` `slack` `discord` `wechat` `memory` `plugin-compat` `solved`
- `#plugin-compat`：和其他 DSH 插件的兼容问题
- `#ideas`：Forum 频道。功能建议，想接的平台

**🤖 BOTS**

- `#bot-playground`：给 DeepSeekBot 接 Discord 后，让 bot 在这里回话（只给 bot 和成员发言权限，慢速模式 10 秒）

**🔧 DEV**

- `#contributing`：PR、代码讨论
- `#github-feed`：只读。GitHub webhook（BotHarness / BotPixel 的 release、PR）

**🔊 VOICE**

- `Lounge`：语音

## 角色

| 角色               | 用途                      | 权限                        |
| ------------------ | ------------------------- | --------------------------- |
| `Maintainer`       | 你和核心成员              | 管理频道、消息、成员        |
| `Contributor`      | 提过 PR 的人              | 可在 `#contributing` 置顶   |
| `Bot`              | 你接入的 DeepSeekBot 账号 | 只在 `#bot-playground` 发言 |
| `English` / `中文` | Onboarding 里自选         | 无额外权限，只是方便 @      |

## 服务器设置

- Server Settings → Enable Community：打开（才能用 Forum、Announcement、Onboarding、Rules Channel）
- Verification Level：Low（验证过邮箱）
- Explicit image filter：All members
- Default notifications：Only @mentions
- AutoMod：打开「Block spam content」和「Block mention spam」（上限 5）
- 邀请链接：在 `#welcome` 上生成，设成「永不过期」，就是上面这条

## `#welcome` 欢迎词

```
👋 Welcome to DeepSeekBot!

DeepSeekBot is the open-source Grok Bot alternative, based on DeepSeek Harness (DSH). Bots with their own identity, persona and memory, in Lark, Slack, Discord and WeChat. It runs on DSH's own sessions and harness, so any LLM provider you connect in DSH works.

🌐 https://go.botharness.ai/dc
⭐ https://github.com/BotHarness/BotHarness
📖 https://go.botharness.ai/dc-docs

Try it: open DeepSeek Harness → Plugins → Add plugin, enter deepseekbot and click Install.

Stuck? Ask in #install-help. Found a bug? #bugs or GitHub Issues.

—

欢迎来到 DeepSeekBot！开源的 GrokBot 平替，基于 DeepSeek Harness（DSH）。
官网：https://go.botharness.ai/dc-zh
中文交流请到 #中文交流，安装问题到 #install-help。
```

## `#rules` 规则

```
1. Be kind. No harassment, hate speech or personal attacks. / 友善交流，禁止人身攻击和歧视言论。
2. No spam or unsolicited ads. / 禁止刷屏和广告。
3. Keep it on topic: use #install-help for setup, #bugs for bugs, #ideas for requests. / 按频道发帖。
4. Never post API keys, tokens or private data. / 不要贴 API Key、Token 或隐私信息。
5. Plugin incompatibilities are welcome as reports: open an Issue or PR. / 和其他 DSH 插件不兼容欢迎反馈、提 Issue 或 PR。
6. DeepSeekBot is a community project, not affiliated with DeepSeek or xAI. / 社区项目，与 DeepSeek、xAI 无隶属关系。
```

## `#announcements` 第一条

```
DeepSeekBot 1.0.1 is out 🎉 The open-source Grok Bot alternative, based on DeepSeek Harness (DSH).
Watch the 3-minute tour: <YouTube link>
Site: https://go.botharness.ai/dc-news
```
