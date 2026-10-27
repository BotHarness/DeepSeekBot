# 分享 Bot 到 Bot 市场

分享 Bot 有两种去向：用 Tobs 账号上传到 Tobs 市场，或者推送到你 GitHub 上的一个公开仓库。不管哪种，发出去的都只是一份**分享草稿**：Tob 先和你一起检查过的 Memory 文件副本，不带任何 Git 历史。别人在 Bot 市场里安装它，会得到一个带同样记忆的新 Bot。你的 Bot 本身、聊天记录、工作区授权和 IM 连接都不会被分享，之后在你这边的对话也不会自动同步过去。

## 不想公开？直接发 zip

如果只想把 Bot 交给认识的人，或者搬到另一台电脑，不需要发布到市场：在 Bot 资料页右上角点 **分享** 导出 zip，对方用 **从 zip 导入** 就能得到一个新的 Bot。见[导出与导入 Bot](/zh/docs/bot-zip)。

## 让 Tob 帮你分享（推荐）

1. 打开 Bot 的资料页，点右上角的 **⋯**，再点 **分享到市场**。（在 Bot 市场里点 **上传 Bot → 分享 Bot** 也一样。）
2. 点 **让 Tob 检查**。Tob 会把这个 Bot 的文件复制成一份分享草稿，并打开和它的私聊。它逐个文件检查，遇到看起来涉及隐私的内容，比如密钥、密码、邮箱、电话或私人对话，就问你保留、改写还是删掉。Bot 自己的 Memory 不会被改动。
3. 每个文件都有了结论后，上传表单会在草稿上打开。选择去向：
   - **Tobs 市场**：登录 Tobs 账号，第一次时起一个作者名，确认名称、简介和标签后上传。不需要 GitHub 账号。
   - **我的 GitHub**：Tob 把草稿作为一个新的公开仓库推上去，只有一个提交，并加上 `botharness-bot` 话题，最后把地址发给你。Host 需要装好 [GitHub CLI](https://cli.github.com/) 并运行过 `gh auth login`。

草稿不带历史，所以 Bot 的 Git 历史里以前删掉的文件也不会公开。

## 自己发布 Memory Repository

这样会发布整个 Memory Repository，包括 Git 历史，也没有 Tob 的检查，请先自己看一遍文件和历史。在 **设置 → 工作区授权** 里找到这个 Bot 的 Memory Repository 路径，然后在终端执行（把 `<路径>` 和 `<仓库名>` 换成你自己的）：

```bash
cd <路径>
gh repo create <仓库名> --public --source . --push
gh repo edit --add-topic botharness-bot
```

也可以在 GitHub 网页上新建一个空的公开仓库，用 `git remote add origin` 和 `git push -u origin HEAD` 推送，然后在仓库首页右侧的 **About → Topics** 里加上 `botharness-bot`。

## 让它出现在 Bot 市场

收录需要仓库是公开的，并且带有 `botharness-bot` 话题。满足条件的仓库每天会被自动收录一次；想马上出现，点 Tobs 侧栏消息列表上方的 **＋（新建）→ Bot 市场**，在顶部贴入仓库地址，点 **收录**：

![在 Bot 市场贴入仓库地址，立即收录](/guides/share-bot/03-market-paste-zh.webp)

收录后，它会出现在 Tobs 的 Bot 市场和 [官网 Bot 市场](https://deepseekbot.botharness.ai/market) 里，显示 README、Star 数、更新时间和话题。之后你每次推送，市场会在一小时内更新到最新提交。

![收录后在官网 Bot 市场看到的样子](/guides/share-bot/04-site-market-zh.webp)

收录失败时，Bot 市场会说明原因：

| 提示                              | 下一步                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| 找不到这个仓库 / 这个仓库是私有的 | 确认地址正确，并在 GitHub 把仓库设为 Public。              |
| 缺少 botharness-bot 话题          | 在仓库首页 **About → Topics** 加上 `botharness-bot` 再试。 |
| 这个仓库刚刚收录过                | 同一个仓库 5 分钟内只抓取一次，稍后再试。                  |
| 这个仓库已被屏蔽或因举报隐藏      | 可以在 GitHub 上给 BotHarness 开 Issue 联系我们。          |

## 设置名称、标签、简介、头像和横幅：`.botharness/bot.json`

Tobs 会自动在每个 Bot 的 Memory 里生成 `.botharness/bot.json`，并保持更新：创建 Bot 时写入，之后每次在 **编辑资料** 里改名称、标签、简介，或者改头像，都会同步。之前创建的 Bot 会在 Tobs 下次启动时补上这个文件。市场和安装后的 Bot 都读它，所以显示的名称、标签、简介和头像和你侧栏里的一致。上传的头像图片会存为旁边的 `.botharness/avatar.png`（或 `.jpg`、`.webp`）。资料横幅总是存为 `.botharness/banner.png`（1500 × 500），不管是生成的像素场景还是上传的图片。

也可以手动编辑这个文件。你加的其他字段会保留；手动改的内容会一直保留，直到你下次在 Tobs 里改名称、标签、简介或头像：

```json
{
  "name": "BotPixel 像素画师",
  "tags": ["像素画", "头像设计"],
  "bio": "把一句话描述画成像素头像。",
  "avatar": { "image": "assets/avatar.png" },
  "banner": { "recipe": { "scene": "sea", "seed": 2786543041 } }
}
```

| 字段     | 说明                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`   | 在市场里显示的名称，最多 60 个字。                                                                                                                                                                                                         |
| `tags`   | 标签，最多 8 个，每个不超过 32 个字。旧文件里的 `roles` 仍会当作标签读取。                                                                                                                                                                 |
| `bio`    | 一句话简介，最多 160 个字。没有时市场显示 GitHub 仓库的描述。                                                                                                                                                                              |
| `avatar` | 头像：`{ "image": "仓库里的图片路径" }`，PNG、JPEG 或 WebP，最大 128 KiB；或者 `{ "recipe": … }` 像素头像配方。                                                                                                                            |
| `banner` | 横幅：生成的像素场景 `{ "recipe": { "scene", "seed" } }`，或 `{ "image": ".botharness/banner.png" }`（3:1 的 PNG，最大 2 MB）。场景：`spring`、`summer`、`autumn`、`winter`、`sea`、`mountain`、`desert`、`forest`、`night-sky`、`space`。 |

所有字段都可以省略。某个字段超出限制（例如简介超过 160 个字符）时只跳过这个字段，其他字段照常生效。文件不是合法 JSON 或超过 16 KB 时整个文件会被忽略，市场改用仓库名和自动生成的像素头像。

## 中英文：`README.zh-CN.md` 和 `i18n`

Tobs 里和官网上的 Bot 市场会按读者的语言（中文或英文）显示每个 Bot，前提是仓库里有这种语言的内容。先用一种语言写好，再在旁边补上另一种：

| 内容              | 放在哪里                                                | 谁会看到                         |
| ----------------- | ------------------------------------------------------- | -------------------------------- |
| 中文 README       | 仓库根目录的 `README.zh-CN.md`（`README.zh.md` 也可以） | 用中文的读者                     |
| 英文 README       | 仓库根目录的 `README.en.md`                             | 用英文的读者                     |
| 任意语言的 README | `README.md`                                             | 其他读者，以及没有对应语言版本时 |
| 名称和简介的翻译  | `.botharness/bot.json` 里的 `"i18n"`，键为 `zh` 和 `en` | 用该语言的读者                   |

```json
{
  "name": "Orion",
  "bio": "Tells you what you can see in tonight's sky, for any city and date.",
  "i18n": {
    "zh": { "name": "猎户", "bio": "告诉你今晚能看到什么，任意城市和日期。" }
  }
}
```

`i18n` 里的 `name`（最多 60 个字）和 `bio`（最多 160 个字）规则和顶层一样，都可以省略。`README.md` 和 `bio` 用你最顺手的语言写；市场会判断 `bio` 是哪种语言，英文的 `bio` 本身就是英文版，只需要再加 `zh`。`README.zh-CN.md` 里的图片和链接与 `README.md` 一样处理。`README.zh.md`、`README_CN.md`、`README-zh.md` 这几种写法也能识别，同时存在时优先用 `README.zh-CN.md`。

如果某种语言下没有作者写的简介，市场会用 AI 模型，根据名称、GitHub 描述、简介和 README 写一句该语言的简介，代替原简介显示，并标注“AI 摘要”。作者自己写的内容总是优先：加上 `i18n` 简介，或者直接用该语言写 `bio`，就不再显示生成的简介。推送或修改仓库的 GitHub 描述后，如果生成所依据的内容有变化，一小时内会重新生成。README 正文不会被翻译。

## 资料横幅

每个 Bot 的资料页顶部，以及在私聊顶部点名字弹出的小窗顶部，都有一张横幅。新建的 Bot 会按名字挑一张像素场景，之后改名不会变；横幅上线前创建的 Bot，会在 Tobs 下次启动时补上一张。

鼠标移到横幅上，点 **更换横幅**，可以：

- 从十个场景里挑一个：春、夏、秋、冬、海、山、沙漠、森林、星空、太空；
- **换一张**：同一个场景换一幅画；
- **上传图片**：上传自己的图片并裁成 3:1；
- **恢复生成**：回到按 Bot 当前名字挑的场景。

![更换横幅：预览、换一张、上传图片、恢复生成和十个场景](/guides/share-bot/05-banner-zh.webp)

横幅跟着 Bot 走：Bot Zip 导出、导入，以及从 GitHub 安装，都会保留它。

相关：[记忆文件](/zh/docs/channel-sidebar/memory-files)、[记忆演化](/zh/docs/channel-sidebar/memory-evolution)。
