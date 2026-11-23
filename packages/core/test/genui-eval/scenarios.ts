export interface GenuiEvalScenario {
  id: string;
  prompt: string;
  diagrams: number;
  required: string[];
}

const bots = [
  ['bot-atlas', 'deepseek-v4.1', 412, 3.18, '正常'],
  ['bot-birch', 'deepseek-v4.1-flash', 1290, 1.94, '正常'],
  ['bot-cobalt', 'deepseek-v4.1', 233, 2.07, '告警'],
  ['bot-dune', 'deepseek-v4.1-flash', 876, 1.31, '正常'],
  ['bot-ember', 'deepseek-v4.1', 158, 0.92, '告警'],
  ['bot-fjord', 'deepseek-v4.1-flash', 1544, 2.4, '正常'],
  ['bot-grove', 'deepseek-v4.1', 97, 0.66, '正常'],
  ['bot-harbor', 'deepseek-v4.1-flash', 1032, 1.58, '告警'],
] as const;

const months = [
  ['1月', 182],
  ['2月', 205],
  ['3月', 241],
  ['4月', 236],
  ['5月', 298],
  ['6月', 333],
  ['7月', 361],
  ['8月', 349],
  ['9月', 402],
  ['10月', 455],
  ['11月', 471],
  ['12月', 520],
] as const;

const plans = [
  ['Starter', '$0', '1', '100', '社区'],
  ['Plus', '$12', '3', '2,000', '邮件'],
  ['Team', '$39', '10', '15,000', '工作日'],
  ['Business', '$99', '30', '60,000', '7×24'],
  ['Enterprise', '定制', '不限', '不限', '专属经理'],
] as const;

export const GENUI_EVAL_SCENARIOS: GenuiEvalScenario[] = [
  {
    id: 'weekly-report',
    diagrams: 2,
    prompt: `给我做一份 GenUI「Bot 运行周报」发到我的 DM。包含：
1. 三个指标：总消息 5,642、总成本 $14.06、告警 3。
2. 一张流程图说明消息流转：收到消息 → 路由判断；DM 直接到 Bot 回复；群聊先经过 Admission 再到 Bot 回复；Bot 回复 → Outbox → IM 投递。
3. 一张柱状图：每个 Bot 的消息数。
4. 一张表格，列：Bot、模型、消息数、成本($)、状态，并提供“只看告警”的筛选按钮。
数据：
${bots.map((row) => row.join(' | ')).join('\n')}`,
    required: [
      '5,642',
      '$14.06',
      'Admission',
      'Outbox',
      'IM 投递',
      ...bots.flatMap(([name, , messages, cost]) => [name, String(messages), String(cost)]),
    ],
  },
  {
    id: 'login-sequence',
    diagrams: 1,
    prompt: `用 GenUI 给我讲清楚手机扫码登录桌面端的过程，发到我的 DM。需要一张时序图，参与者：手机 App、桌面端、Host、账号服务。步骤：
1. 桌面端向 Host 请求登录二维码
2. Host 返回一次性 token 和二维码
3. 手机 App 扫码并把 token 发给 Host
4. Host 向账号服务校验手机会话
5. 账号服务返回校验通过
6. Host 通知桌面端登录成功
再附一张错误码表（错误码、含义）：
E401 | 手机会话已过期
E409 | 二维码已被使用
E410 | 二维码已过期（超过 120 秒）
E429 | 请求过于频繁`,
    required: [
      '手机 App',
      '桌面端',
      '账号服务',
      'E401',
      'E409',
      'E410',
      'E429',
      '120',
      '二维码已被使用',
    ],
  },
  {
    id: 'monthly-trend',
    diagrams: 1,
    prompt: `用 GenUI 画一份 2026 年每月活跃 Bot 数的趋势报告发到我的 DM：一张折线图（x 轴月份，y 轴活跃 Bot 数），上方放三个指标：全年峰值 520（12 月）、同比增长 186%、月均 321。
数据：
${months.map((row) => row.join(' ')).join('\n')}`,
    required: ['520', '186%', '321', ...months.map(([, value]) => String(value))],
  },
  {
    id: 'plan-table',
    diagrams: 0,
    prompt: `用 GenUI 做一张套餐对比表发到我的 DM，列：套餐、月费、Bot 数、每月消息、支持。让用户可以点选一个套餐高亮。
${plans.map((row) => row.join(' | ')).join('\n')}`,
    required: plans.flat(),
  },
];
