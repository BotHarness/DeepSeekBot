# 团队模式：一台 Host，多位 Host Member

Human 在 2026-11-13 完成 Q1–Q35 并确认的目标设计，不代表已实现或已验收。规范性决定见 [ADR-0336](../adr/0336-hosts-have-members.md)。与[环境面板设计](environment-panel.zh.md)正交（后者是一个 Human、多台 Host）。[English](team-mode.md)。

## 为什么

一台 Tobs Host（办公电脑或 VPS）可以被同事远程使用，每人都是独立的 Host Member：拥有自己的私有 Bot，在公开 Channel 与其他 Human 和 Bot 协作，让共享 Bot 沉淀团队上下文。小团队在自己掌控的机器上获得基础 IM（消息、文件）和"Bot 同事"；同一台 Host 可做权限隔离，共享 AI 算力与知识库。

## 决定摘要

- **模型**：数据结构始终多成员，`local-human` 即 Host Owner；团队模式只是策略开关。关闭时停用其他成员，保留数据。
- **身份**：Host 是身份权威，身份与凭据分离；首个凭据类型为本地用户名密码（argon2id），以后可接 OIDC，不做跨 Host 目录同步。设备凭据 = 设备 × Host × Human ID。
- **访问**：本机 Desktop、loopback 与 CLI 以 Owner 身份进入（可选要求密码）；内网浏览器无需安装即可登录；非本机密码登录必须走 HTTPS 或加密网关；API Gateway 对成员默认拒绝 DSH 原生接口。邀请链接或二维码含 Host 指纹，初始密码线下转交，首次登录强制改密。
- **权限**：Owner 唯一；其余为"角色 → 固定权限目录"（内置 Admin、Member）。角色策略复用 Behavior permission item（Allow/Deny，Deny 优先），只是指引，不是访问控制。Owner 可查看私有内容，每次都会审计并告知成员。
- **受众包含**：Bot 可见性 `private`/`roles`/`shared`；Channel 可见性 `public`/`roles`/`private`，并有飞书式群管理；新增 Human–Human DM；Workspace 分个人根目录和共享根目录，拒绝授权到他人根目录、任何 Memory 仓库或 Host 数据目录；Bot–Bot DM 仅参与 Bot 的 Owner 可读。
- **审批**：卡片留在原处，对非审批人遮罩；无人可批时转入 Bot Owner 的 Activity。不透明工具仅 Owner/Admin 可批，dangerous preset 仅 Owner 可开。
- **按人拆分**：Activity、已读、推送按 Human ID；每个成员有自己的私有 Tob；用量按人与 Bot 计量；角色可限制可用模型。
- **离职**：停用 → 移交 → 单独确认后永久删除。
- **Host Relationship** 在团队模式下仅授权 Owner 的 Client。

## OS 沙箱（未来）

可选路线为按次执行的进程沙箱（Linux Landlock/bubblewrap、macOS Seatbelt、Windows AppContainer），文件白名单 = 授权目录 + Memory，接入 DSH Execution World Provider。代价：三平台分别实现，工具需要的缓存与配置需要放行，需要配套网络策略，故障难排查，且挡不住 Host 进程自身的漏洞。本次不在范围内。

## 交付切片

M0 去硬编码 → **M1 首个端到端 tracer**（开启团队模式、创建成员、内网 HTTPS 登录、加入公开 Channel 互发消息、CLI）→ M2 私有 Bot、Tob 与 Activity → M3 角色与成员管理 → M4 Channel 可见性与 Human DM → M5 审批 → M6 Workspace → M7 Bot 可见性与角色策略 → M8 移动端 → M9 密码与离职 → M10 用量 → M11 审计。依赖关系见[英文版](team-mode.md#delivery)。M1 完成后先取得 Human 反馈，再扩展。
