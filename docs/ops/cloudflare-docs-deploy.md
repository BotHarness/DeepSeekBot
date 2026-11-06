# 文档站部署（Cloudflare Workers）

`apps/docs` 是 Nimbus（Astro 7）静态站点，产出 `dist/`，由 Cloudflare Workers Static Assets 托管。

- 域名：**`botharness.ai` 与 `botharness.dev` 都绑定同一个 Worker**，服务同一份站点（同一构建、同一内容）
- 区块：`/docs` 用户文档 · `/dev` 开发者与审计（架构 / 产品术语 / Guides / Reference / ADR） · `/changelog`
- Account：`332e72d480d7cb3e60ee671d3ca0cad0`（yangmufeng233@gmail.com）
- Worker 名：`botharness-docs`（见 `apps/docs/wrangler.jsonc`）
- 旧地址：`/en/**` 已迁到根路径，由 `apps/docs/public/_redirects` 做 301

## 部署方式：手动部署（当前选择）

在本地直接构建并发布，构建环境、Node 版本、依赖都与仓库一致：

```bash
pnpm install               # 首次
pnpm docs:deploy           # 等于 pnpm --filter docs run deploy
                           # = sync-docs + astro build + wrangler deploy
```

- 需要 `pnpm exec wrangler login`（或 `CLOUDFLARE_API_TOKEN`）一次。
- 构建会先跑 `scripts/sync-docs.mjs`，把 living architecture、`GLOSSARY.md`、Guides、生成 Reference、ADR 与 changelog 同步进 `src/content/`。
- 首次部署后，在 Dashboard → Worker → Settings → Domains & Routes 确认 **`botharness.ai` 和 `botharness.dev` 都是自定义域名**（同一 Worker、同一份内容，无需重定向）。

## 可选：Workers Builds（Git 集成，后续再做）

如果以后想 push 即部署，可在 Dashboard → Workers & Pages → Create → **Import a repository** 接 `BotHarness/BotHarness`：

1. Worker 名称填 `botharness-docs`（必须与 `wrangler.jsonc` 的 `name` 一致）。
2. Build 配置：**Root directory** `apps/docs`；**Build command** `pnpm build`；**Deploy command** `pnpm exec wrangler deploy`。
3. 非生产分支会产出预览 URL（`preview_urls: true`）；免费额度 1 并发构建 / 3000 构建分钟每月。

注意：Workers Builds 与手动部署写同一个 Worker；两条路线同时用会互相覆盖，选定一条作为主路线即可。

API Token（如用 GitHub Actions 路线）放 GitHub secrets，权限仅需 **Workers Scripts: Edit**；**不要**提交到仓库或贴进对话。

## 缓存

`apps/docs/public/_headers` 已为 `/_astro/*`（带指纹的资源）设置一年 immutable 缓存；HTML 走 Workers 默认的 `must-revalidate` + ETag。
