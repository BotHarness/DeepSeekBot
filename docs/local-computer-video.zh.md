# Local Computer 视频：Windows 到 Android

首片实现面向一块 Windows x64 主显示器和一个 Android 观看端。安装包、真机性能与 Human 验收必须绑定准确构建记录，才能声明通过。其他发送端和容器观看路径保留既有行为。

使用「检查权限」或 `deepseekbot computer-start --target local` 启动本机 Computer。既有的显式安装校验流程会按需安装固定版本采集 helper：Windows x64 Electron 44.9.3，下载量 158,508,870 字节；解压后的占用需在验收机器实测。Host 监管独立 helper 进程。Android 新增本机视频模块，必须重建开发客户端，旧客户端仅刷新 JavaScript 不够。

安装还会直接调用系统 .NET Framework 编译器，编译随包提供的 Windows Job 启动器，不启动编译服务。此步骤有时间上限，仅在明确安装时执行；观看不会下载或编译 helper。编译、校验或桌面访问失败时，视频保持不可用。启动器拥有完整 Electron 进程树；清理未确认时禁止再次采集，不把根进程退出当作清理成功。

打开已启用 Computer Access 的 Bot，选择「Computer」。观看不会暂停 Bot。「接管」先保存整台 Computer 的暂停状态，再等待正在执行的 Bot 操作结束，之后点击才会成为桌面操作。首片仅开放直点；更多手势和文字输入由后续切片验收。

视频与输入使用主显示器的物理像素尺寸。授予控制和每次输入之前，owner 都比较 Windows 驱动报告的尺寸与采集尺寸；不会重复乘以 DPI 缩放比例。尺寸不匹配或发生变化时拒绝输入。

「释放控制」会保持 Bot 暂停。「恢复 Bot」明确结束接管，等待 Human 输入执行完毕，再保存恢复状态。手机失联、helper 失败和 Host 重启都不会自动恢复 Bot；重启也不会恢复旧控制权。媒体无法启动时，仍可通过 CLI 明确恢复。

手机切后台或锁屏会停止媒体、释放控制；回到前台仅恢复观看，需要再次明确接管。第二观看端收到 `viewer-limit`，不会挤掉第一端。画面停滞或新鲜度未确认时禁止输入。静态活画面仍须通过真机验收；重复 canvas 帧不能单独证明采集正常。

新观看端没有自动或手动图片回退。本机能力缺失、协商失败或媒体中断会显示拒绝与重试状态，不轮询 `/api/computer/frame`。迁移后的 Windows 本机 Computer 对旧帧、输入和接管入口返回 `update-required`。Bot 截图是独立能力，暂停期间同样拒绝。

T1 使用直连 WebRTC，未配置 STUN/TURN。手机的信令和控制复用既有加密 LAN 通道、固定 Host 密钥和已批准的设备身份；只有服务端拥有的 LAN listener 才把准确的视频命令路径直接分派给 Computer owner。Hosted Connect 虽已具备加密 carrier，仍返回 `connect-carrier-required`；远程媒体验收属于后续切片。没有 WebView 或明文回退，也没有自配 TURN、音频、剪贴板、后台观看或解锁功能。

画面停滞时禁止输入，但「释放控制」「恢复 Bot」、退出和「重新连接」仍可用。释放按钮依据调用者保留的 grant 显示，与能否输入分开。重新连接先关闭旧 attempt，再恢复观看，不恢复控制权、不重放输入。

## 恢复与降级

接管后不能安全地仅回滚代码：旧版本忽略 `botharness/computer-pause.json`，重启可能重新放行 Bot。保持受影响的 Computer 停止，确认其媒体已停止，并保留暂停记录。只有 Human 明确选择恢复 Bot 时，才在降级前通过新版本支持的恢复操作排空输入并恢复；否则使用继续遵守持久暂停的向前修复。不可为了降级自动恢复或删除暂停记录。

## Agent 操作

手机、认证 Host／Device gateway 与 CLI 消费同一个 Computer owner。通过 [CLI 命令](bot-cli.zh.md#local-computer-视频) 查看暂停、全局观看与控制状态、协商和明确恢复。`controller` 与 grant 只属于调用者；`viewerCount` 和 `controlHeld` 表示全局状态。CLI 不打印私密信令内容。

控制心跳静默 6 秒后停止接收输入，30 秒内释放控制保留与媒体。接收端呈现计数须在 5 秒内前进；helper 独立要求 2 秒内真实采集进展及 4 秒内编码进展，与桌面内容是否变化分开判断。命令和 drain 最多等待 10 秒，清理最多等待 3 秒。owner 最多接收八个待处理命令，并独立限制本机输入积压；请求体上限 128 KiB，SDP 上限 96 KiB。超限返回 coded refusal，不恢复 Bot。

## 验收

[本机验证旅程](../.agents/skills/verify-deepseekbot/features/local-computer-video.md) 覆盖控制栅栏、已建立媒体的撤销、静态活画面和运动场景测量。采集计数、解码帧、EGL swap、TextureView 更新与物理屏幕显示是不同指标。须用可见运动帧编号交叉核对绑定 attempt 的呈现计数。声明的 LAN rig 要达到真实呈现至少 15 fps、输入到可见反馈 p95 不超过 500 ms，并保证静态文字可读。单元测试或信令响应不能证明这些结果。
