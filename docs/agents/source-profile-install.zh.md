# 从源码构建产物安装新的原生 Profile

经 review 的源码包含尚未发布到 npm 的业务 CLI 能力时，可使用此开发者路径。先用既有 artifact 机制构建完整产品，再安装到新的原生 DSH Profile。这是候选构建，不是公开 npm 发布版本。

本路径验证的工具链是 Node 24.21.0、pnpm 12.4.2 和 DSH 0.2.0-rc.1。兼容范围声明不能证明另一个 Host 版本可以运行。选择包含 `scripts/install-source-profile.mjs` 的精确 review 后 Git revision，并连同产物 manifest、文件 digest 一起记录。

## 在开发机构建

使用独立 checkout，不更新包含其它任务未提交工作的 checkout。

```bash
git clone https://github.com/BotHarness/DeepSeekBot.git botharness-source
cd botharness-source
git checkout <reviewed-source-sha>
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build

git clone https://github.com/DoodleBears/dsh-im.git qualified-provider
git -C qualified-provider checkout 602baa37fa327f7069545aaadbbd34db8a8f4636
cd qualified-provider
npm ci --ignore-scripts
cd ..
node scripts/product-artifacts.mjs \
  --output .humanlayer/product-candidate \
  --provider-source qualified-provider \
  --version <explicit-candidate-semver>
```

`product-artifacts.mjs` 检查不可变 Provider 来源，打包 Core、Client、浏览器、计算机、Provider、各平台的 `cloudflared` 包（会下载固定版本并核对 SHA-256；传 `--cloudflared-assets <dir>` 可复用已下载的目录）和 application Bundle，并写入含包 integrity 的 `artifacts.json`。使用新的输出目录。对 workspace 源码目录直接 `npm pack` 不能替代这一步。构建其它 revision 前，重新检查该源码 `productImProvider` 固定的 Provider revision。

将归档和 `artifacts.json` 放在一起。小规格 VPS 优先接收预编译结果，不在其上构建全部 workspace。传输前记录归档 SHA-256，在目标机核对相同 digest。

## 在目标机安装

使用独立运行用户及其可写的 `DSH_HOME`。父目录需允许该用户穿越，当前工作目录也需可读。选择名称前检查已有 HOME、Profile 和服务。按实际操作系统安装固定 Node、pnpm 和 DSH CLI。

目标机需将以下仓库 helper 放在同一个私密 installation-kit 目录：

```text
install-source-profile.mjs
packaged-profile.mjs
product-artifacts.mjs
cloudflared-packages.mjs
dev-im-provider.mjs
dev-package-manager.mjs
```

运行依赖是 `yaml@2.9.1` 和 `semver@7.8.5`；可在 kit 安装它们，也可从已准备好的源码 checkout 运行 helper。以运行用户执行，并将固定工具链加入 PATH：

```bash
node <kit>/install-source-profile.mjs \
  --home <new-writable-dsh-home> \
  --profile tutorial-web \
  --artifacts <directory-containing-artifacts-json-and-archives> \
  --dsh <pinned-dsh-binary>
```

helper 校验 artifact integrity、DSH 和 pnpm 版本，让原生 DSH 从 `web` 默认 Profile 创建自定义 Profile，再应用完整 Bundle 依赖及审核过的构建策略，最后核对已安装包和六个启用的产品组件。已有 Profile 会拒绝，不会覆盖。部分安装失败后应先检查再恢复；重复运行不是更新流程。

根据已安装 `dsh web --help` 验证的参数启动同一个 Profile。Host 绑定 loopback，保留原生 Owner 认证，并核对真实模型回复。服务管理、Tailscale Serve、应用授权和绑定是后续独立步骤，安装器成功不证明它们已完成。

## 资格验证证据

Issue [#1438](https://github.com/BotHarness/DeepSeekBot/issues/1438) 在真实 Ubuntu 26.04 VPS 上使用此安装器创建了新的 Profile：2 vCPU、云规格 4 GB 内存、DSH 0.2.0-rc.1，源码为 `73c75f86aa50767be34a5c8d2cadc17b6a3e8862`。已验证原生 loopback 认证、tailnet HTTPS、真实关联的本地 DM，以及任务服务重启后的新 DM。随后更新至源码 `031a14db43af5b3bf52e76b01c30e27828e6e9c9`，原 Bot 保留并产生了新的关联回复。

后续独立 QQ 验收已将 Host 重启前后的不同请求关联到已处理 Inbox Admission 与 provider-accepted Outbox intent；Human 确认原群两次匹配回复。公开原群图片及视频审阅仍待完成。完整操作见 [VPS/QQ 教程](../vps-qq-tutorial.zh.md)、[可复用 QQ QA 客户端](qq-test-clients.md)和 [QQ 连接指南](../qq-connection.md)。

![真实教程 Bot 的模型设置，以及对源码版本标记的回复](../assets/vps-source/01-real-dm-031a14db.png)

_2026-10-11 17:55 UTC 从实际运行的源码候选 `1.2.1-vps.20261012.sha031a14db` 采集。底部请求及其对应回复是真实模型输出；上方较大的欢迎卡明确标为预设产品文字。画面不含授权表单或浏览器地址栏。_
