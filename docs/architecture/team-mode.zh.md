# 团队模式：一台 Host，多位 Host Member

Human 在 2026-11-13 完成 Q1–Q35 并确认的目标设计，不代表已实现或已验收。规范性决定见 [ADR-0336](../adr/0336-hosts-have-members.md)。与[环境面板设计](environment-panel.zh.md)正交（后者是一个 Human、多台 Host）。[English](team-mode.md)。

## 为什么

一台 Tobs Host（办公电脑或 VPS）可以被同事远程使用，每人都是独立的 Host Member：拥有自己的私有 Bot，在公开 Channel 与其他 Human 和 Bot 协作，让共享 Bot 沉淀团队上下文。小团队在自己掌控的机器上获得基础 IM（消息、文件）和"Bot 同事"；同一台 Host 可做权限隔离，共享 AI 算力与知识库。

## 决定摘要

- **模型**：数据结构始终多成员，`local-human` 即 Host Owner；团队模式只是策略开关。关闭时停用其他成员，保留数据。
- **身份**：Host 是身份权威，身份与凭据分离；首个凭据类型为本地用户名密码（argon2id），以后可接 OIDC，不做跨 Host 目录同步。设备凭据 = 设备 × Host × Human ID。
- **访问**：本机 Desktop、loopback 与 CLI 以 Owner 身份进入（可选要求密码）；内网浏览器无需安装即可登录；非本机密码登录必须走 HTTPS 或加密网关；API Gateway 对成员默认拒绝 DSH 原生接口。邀请链接或二维码含 Host 指纹，初始密码线下转交，首次登录强制改密。
- **权限**：Owner 唯一；其余为"角色 → 固定权限目录"（内置 Admin、Member）。角色策略复用 Behavior permission item（Allow/Deny，Deny 优先），只是指引，不是访问控制。Owner 可查看私有内容，每次都会审计并告知成员。
- **受众包含**：Bot 可见性 `private`/`roles`/`shared`；Channel 可见性 `public`/`roles`/`private`，并有飞书式群管理；新增 Human–Human DM；Workspace 分个人根目录和共享根目录，拒绝落在他人根目录、任何 Memory 仓库或 Host 数据目录之内或之上的授权；Bot–Bot DM 仅参与 Bot 的 Owner 和经审计的私有内容查看者可读。
- **审批**：卡片留在原处，对非审批人遮罩；无人可批时转入 Bot Owner 的 Activity。不透明工具需持有不透明工具权限（默认 Owner/Admin）才能审批，dangerous preset 仅 Owner 可开。
- **按人拆分**：Activity、已读、推送按 Human ID；每个成员有自己的私有 Tob；用量按人与 Bot 计量；角色可限制可用模型。
- **离职**：停用 → 移交 → 单独确认后永久删除。
- **Host Relationship** 在团队模式下仅授权 Owner 的 Client。

## 执行隔离（2026-11-14 修订）

[调研](../research/2026-11-14-team-mode-execution-isolation.md)发现，DSH 自带的沙箱只限制写，不限制读和网络。按 ADR-0205，`workspace-write` 下成员 Bot 的 Shell 不弹审批，所以它能读到其他 Bot 的 Memory、数据库、凭据和其他空间。DSH 只提供本机执行后端；DSH 里也没有单一的 "Execution World Provider"，`ctx.sandbox`、`ctx.fs`、`ctx.subprocess` 和 `ctx.shell` 是各自可以替换的提供者。

敲定的范围：

- M12 之前，Team mode 以轻量**试用**形态开放：只显示一句告知"成员的 Bot 技术上能读到这台 Host 上其他 Bot 的数据"，不对 Shell 做逐次审批；成员 Bot 不能升级，也不能用 `danger-full-access`（M5）。
- **M12**：Linux 执行隔离。给 DSH 的 bwrap 包一层 `runnerCommand` 脚本，隐藏 `DSH_HOME`、各空间目录和 `/home`，只挂回这个 Session 有权访问的目录；网络命名空间拒绝本机、链路本地地址、私有网段和 tailnet；解析不到 Session 时拒绝执行。机密放在 Host 上，所以结束试用之前必须完成 M12。
- 账号空间（`spaces/<humanId>`）和按受众划分的共享空间（如 `shared/team`、`shared/finance`）；每个空间里，Bot 的 Memory（`bots/<slug>/memory`）和可以授权的 `files/` 目录分开存放。
- 不在范围内：账号配额，macOS 和 Windows 的隔离（macOS 上的 Team Host 一直显示试用告知），部署检查脚本，microVM，每个成员一个 OS 用户或容器。高敏感数据建议放在单独的 Host 上。

## 交付切片

M0 去硬编码 → **M1 首个端到端 tracer**（开启团队模式、创建成员、内网 HTTPS 登录、加入公开 Channel 互发消息、CLI）→ M2 私有 Bot、Tob 与 Activity（M11 之前 Owner 不能查看成员私有内容）→ M3 角色与成员管理 → M4 Channel 可见性与 Human DM → M5 审批 → M6 Workspace → M7 Bot 可见性与角色策略 → M8 移动端 → M9 密码与离职 → M10 用量 → M11 审计 → M12 Linux 执行隔离（结束试用告知）。依赖关系见[英文版](team-mode.md#delivery)。M1 完成后先取得 Human 反馈，再扩展。
