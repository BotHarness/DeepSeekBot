# #2921 iOS 原生资料页验收

结论：**未完成全量验收；不得据此关闭 #2921 或宣布发布就绪。**

- 开始时最新 main：`06c5acd49a1273da16b1bba0159470dd1725cef0`（包含43bf7b4a）。独立分支，未重复 cherry-pick。
- 应用修复：`bfecd4fea4af4924dca21568d5cd15b9e59b78d4`；仅大字号 Work 标题/描述取消两行限制，普通字号保留。
- iOS27.0 iPhone18ProMax Simulator：新 Debug native build + 本轮 Metro，440×956 pt；原始驱动 PNG 440×956 px（未再次缩放）。
- iPhone XS Max iOS18.1.1：新签名 Release，375×812 pt / 1125×2436 px；基线与修复各自重新构建/安装。版本0.0.1(1)，Dev bundle；不是商店包或 TestFlight。
- QA Host 同一 main 构建并重启；DSH0.2.1-rc.3，实际模型 opencode-go/deepseek-v4.1-flash。独立加密 LAN、合成数据；未使用日常 Host。
- 中文 UI，浅色/深色；Simulator 字号见下表，手机原字号保留（具体档位未测量）。所有原始截图本地保留；公开副本保留原分辨率，脱敏映射及 SHA-256 见 manifest.json。
- #3036 已将旧 zoom/X/glass 设计改为原生 formSheet、系统下拉关闭和不透明吸顶；按当前接受设计验收。Memory Changes 是主分支已有功能，本轮未移除。

## 逐项结果

整项有未执行子条件时标 UNTESTED，备注保留已通过的子条件；不把替代路径、CLI、CI 充作该原生步骤通过。Android 全部 UNTESTED（Windows 队列）。

| #   | 场景                          | iOS27 Simulator | XS Max iOS18.1.1 | 证据与边界                                                                                                                                                                                                                                                                         |
| --- | ----------------------------- | --------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 打开资料页                    | PASS            | PASS             | 真实 DM 标题胶囊打开原生 formSheet。#3036 已取代旧 zoom/X 设计；不宣称旧缩放转场通过。                                                                                                                                                                                             |
| 2   | 关闭与返回                    | UNTESTED        | UNTESTED         | 实际下拉关闭回到原页面；子页面返回正常，无发消息/分享按钮。首次手机快速 swipe 未关闭，后续结构化原生 pan 通过；不把失败尝试抹掉。系统返回及无障碍 Escape 单独未测。                                                                                                                |
| 3   | Bot-to-Bot                    | PASS            | PASS             | 真实 Bot 双人 DM：双头像，仅 Media/Files，无五项资料 tab。                                                                                                                                                                                                                         |
| 4   | 头部和权限入口                | UNTESTED        | UNTESTED         | banner/头像/名称/状态显示，开权限 Bot 显示 Computer、无权限 Bot 不显示入口。Browser 在加密 LAN 路由被生产适配器主动禁用；该入口未验收。                                                                                                                                            |
| 5   | 五个原生 tab                  | PASS            | PASS             | SwiftUI SF Symbols 分段控件，Work/Memory/Files/Routines/Settings，真实选中状态与内容对应。                                                                                                                                                                                         |
| 6   | 吸顶与透明度                  | PASS            | PASS             | 滚动后吸顶；当前 #3036 是不透明承托层，旧玻璃要求已被取代。模拟器真实降低透明度 0→1→0 已核对；手机未改辅助功能开关。                                                                                                                                                               |
| 7   | 左右滑动与两端                | PASS            | UNTESTED         | 模拟器 Work→Memory→Work 原生横滑，以及首尾边界停住通过；手机本轮只验按钮切换。                                                                                                                                                                                                     |
| 8   | tab 记忆隔离                  | PASS            | UNTESTED         | 模拟器经群菜单打开另一 Bot 记住 Work；关闭后群保留 Members，Bot/群各自记忆。手机跨 Bot/群持久化组合未跑完。                                                                                                                                                                        |
| 9   | 标题精简                      | PASS            | PASS             | 非操作 tab 不重复标题；Routines 标题旁有 +。                                                                                                                                                                                                                                       |
| 10  | 工作和详情                    | UNTESTED        | UNTESTED         | 标题/描述/时间/今天分组、只读详情和 MAIN/SUBAGENT01 可见；两次真实 Assignment 均 error、无最终报告，#3102。成功报告/已归档排除/昨天分组未测。显示的是公开时间线投影，无停止/归档/发消息按钮。                                                                                      |
| 11  | 记忆阅读、编辑与冲突          | PASS            | UNTESTED         | 模拟器固定文件、子目录、Markdown、原生编辑保存和并发冲突通过，CLI 确认未覆盖桌面版本。手机阅读/原生键盘保存与 CLI 全文一致通过；手机并发冲突未测。输入驱动的焦点/标点读回失败已保留，未冒充精确输入通过。                                                                          |
| 12  | 共享文件                      | UNTESTED        | PASS             | 两端 Media/Files 分段、图片预览可见。手机普通 TXT 点击打开系统下载分享面板后取消，未发送；模拟器普通文件实际打开未测。                                                                                                                                                             |
| 13  | 定时                          | PASS            | UNTESTED         | 模拟器每天/每周分组、+原生创建、左滑揭示按钮并暂停、详情立即运行/恢复/暂停/删除通过；CLI 核对持久状态及手动 firing handled。新建时间字段驱动读回失败，核对保留09:00后提交，未声称23:58输入通过。手机只验证列表/入口。                                                              |
| 14  | 设置和审批规则                | UNTESTED        | UNTESTED         | 概览→权限→Bot 顺序、拒绝审批记录、工作区授权、Computer/Browser 开关可见；模拟器权限 OFF/ON 与 CLI 一致并恢复。永久规则为空，自动批准计数/撤销规则未测。                                                                                                                            |
| 15  | 群资料                        | UNTESTED        | UNTESTED         | 两端原生四 tab/成员展示；模拟器成员菜单、打开 Bot、群设置末尾解散确认并取消通过，未实际解散。加入申请/待邀请/邀请 Bot 组合未建齐。                                                                                                                                                 |
| 16  | Live Activity 打开 Assignment | UNTESTED        | UNTESTED         | 模拟器不适用；XS Max 确认开始跟踪后提示 Host 暂不支持锁屏状态。该独立测试 Host 未配置 Connect 活动投递提供者，未进入系统 Live Activity。                                                                                                                                           |
| 17  | Live Activity 冷启动          | UNTESTED        | UNTESTED         | 同16，未生成有效系统 Live Activity，不能用普通 deep link 替代。                                                                                                                                                                                                                    |
| 18  | Live Activity 结束后打开      | UNTESTED        | UNTESTED         | 同16，未执行结束后点击。                                                                                                                                                                                                                                                           |
| 19  | 非 Assignment 请求定位        | UNTESTED        | UNTESTED         | 同16，未验证系统 Live Activity → DM 定位。                                                                                                                                                                                                                                         |
| 20  | assignmentId CLI 佐证         | UNTESTED        | PASS             | 手机发出的真实请求，send-status 的 assignmentId 与 canonical Assignment 相同；请求 completed 不等于 Assignment 成功。                                                                                                                                                              |
| 21  | 减弱动态效果                  | FAIL            | UNTESTED         | 模拟器系统开关实际断言为1后录屏，仍纵向滑入，不满足交接的仅淡入淡出要求；#3104 待平台决策。首次无效开关点击录屏已撤回，未用作证据；随后通过系统 UI 恢复0。手机未改原有设置。                                                                                                       |
| 22  | 字体与主题矩阵                | UNTESTED        | UNTESTED         | 模拟器 large / extra-extra-extra-large / accessibility-extra-extra-extra-large × 明暗有实际图；Work 截断原生两次失败，修复后最大字号明暗全文可见。其他页面截图保留，未声明所有长名称/每个列表行/全部裁剪边界均通过。手机保留原字号（档位未测量），明暗核心页面通过；未跑字体矩阵。 |
| 23  | VoiceOver                     | UNTESTED        | UNTESTED         | 原生 AX 能读出 tab 名称和选中状态；未采集 VoiceOver 实际语音，不以 AX 树代替。原旁白关闭状态保留。                                                                                                                                                                                 |

## 修复与验证

- Work 大字号截断：同一原生截图/OCR流程基线 FAIL 两次；修复后最大辅助字号明暗标题完整，实际纵向滚动可见描述末尾。深色前后是同一个13:08 Assignment，同分辨率/主题/字号/合成数据及相同滚动指令；内容高度改变后实际滚动位置不同，已保留全屏上下文。
- XS Max 修复版 Release 重新签名/构建/安装，普通字号 Work 与五个标签深色回归通过；不宣称手机最大字号通过。
- 聚焦5个测试文件64项、移动端和根 typecheck、lint、format:check、changelog:check 通过。CI 以 PR 结果为准。
- 未做性能测量，不宣称帧率或性能改善。Web 无法复现原生 Dynamic Type/SwiftUI 资料控件，该问题直接采用 iOS 原生前后证据；没有用 Web/CI 取代原生验收。

## 后续

- #3102：两次 Assignment error 且无最终报告，根因未定，需补成功报告与有内容的 subagent 时间线。
- #3104：真实 Reduce Motion 开启后的系统表单纵向呈现，需确认/适配当前表单设计的动效要求。
- #2921 保留 Live Activity 的四条系统入口、规则计数/撤销、群邀请/申请、VoiceOver、真机字号矩阵、其余日期/归档组合。
- 未合并、未部署、未发布；未改商店资料。

## 资源收尾

见最终 #2921 评论中的释放回执；公开报告不会把停止资源等同产品验收通过。
