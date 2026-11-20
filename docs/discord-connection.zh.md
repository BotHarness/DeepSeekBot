# 将 Bot 接入 Discord

使用已安装到指定测试服务器的 Discord Bot 应用。Discord 用户登录和应用 Client Secret 都不是 Bot Token。Token 只进入 Provider 的原生凭证流程，不要发到聊天或仓库。

## 连接和绑定

1. 在 [Discord Developer Portal](https://discord.com/developers/applications) 准备 Bot，通过 Discord 应用授权流程安装到目标服务器。
2. 在目标文字频道授予查看频道、读取消息历史和发送消息权限。回复已有公开 Thread 还需在线程中发送消息权限。不要仅为完成配置授予 Administrator。
3. 在原生 **设置 → IM bots** 中连接 Discord 账号。打开 PersonaBot 的 **绑定应用**，绑定已核验的 Discord 身份。
4. 在指定频道发送新标记和真实提及，同时核对 Discord 原位置回复与 Source、Inbox、Outbox 事实。连接指示灯不代表聊天验收成功。

一个 App 只有一个 PersonaBot 所有者。本地共享 Channel 的可见性不会授权其他 Bot 使用该 App 发言。新绑定群默认仅收集提及；普通消息收集和 Channel 同步仍是独立选择。

## 同名的两个提及选哪一个

Discord 可能同时列出同名的 Bot 用户和应用托管角色。直接提及 Bot 用户是已交付的基础路径。#1615 候选还支持应用自己的托管角色：按当前原生服务器与成员核验 `managed: true`、准确的 `tags.bot_id`、Bot 当前持有的角色，以及 `mention_roles` 中准确的角色 ID。

其他角色即使由 Bot 持有，也不构成直接提及；`@everyone`、`@here` 同样不构成直接提及。仅输入显示名称也不会触发请求。原始文本和原生回复位置保持不变。

识别角色提及不会开启特权 Message Content intent，也不能读取平台未交付的内容。所选 App 无法交付角色提及消息时，保留已核验的 Bot 用户提及路径。新增应用权限需要单独授权和真实验收。

## 验证与排查

分别用不同的新标记测试 Bot 用户提及和自身托管角色提及。每个已接纳请求应在原文字频道或已有公开 Thread 中得到一条来源关联回复。测试无关角色、everyone/here 时，不要同时真正提及 Bot 用户。独立开启的普通收集不能将这些反例改成直接请求。

#1615 的 Runtime/Consumer 自动回归已通过，候选的真实平台与安装包验收仍记录为待完成，见[资格记录](dev/verification/discord-1615-managed-role.md)。过去的 Discord 证据不能证明这个新场景。不要为同一 App 启动第二个接收器；先安排独占窗口，结束后恢复原接收器。

参考 [Discord 角色标签](https://docs.discord.com/developers/topics/permissions#role-object) 与[原生消息提及字段](https://docs.discord.com/developers/resources/message#message-object)。
