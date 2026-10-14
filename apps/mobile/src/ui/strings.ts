import type { AggregatedState } from '../host/wire';

const en = {
  roster: 'DeepSeekBot',
  bots: 'PersonaBots',
  channels: 'Channels',
  noBots: 'No PersonaBots on this computer yet.',
  connecting: 'Connecting to your computer…',
  reconnecting: 'Reconnecting…',
  unreachable: 'Cannot reach your computer',
  refused: 'Your computer refused this app',
  pairAgain: 'Pair again',
  retry: 'Retry',
  tried: 'Tried',
  paused: 'Paused',
  members: (count: number) => `${count} members`,
  state: {
    idle: 'Idle',
    thinking: 'Thinking',
    working: 'Working',
    waiting: 'Waiting for you',
    blocked: 'Blocked',
  } satisfies Record<AggregatedState, string>,
  connectTitle: 'Connect to your computer',
  connectHint:
    'Development build: paste the Host address on your tailnet and the launch token printed by dsh web.',
  hostAddress: 'Host address',
  launchToken: 'Launch token',
  connect: 'Connect',
  unpair: 'Unpair',
};

const zh: typeof en = {
  roster: 'DeepSeekBot',
  bots: 'PersonaBot',
  channels: '频道',
  noBots: '这台电脑上还没有 PersonaBot。',
  connecting: '正在连接你的电脑…',
  reconnecting: '正在重新连接…',
  unreachable: '无法连接到你的电脑',
  refused: '你的电脑拒绝了这个应用',
  pairAgain: '重新配对',
  retry: '重试',
  tried: '尝试的地址',
  paused: '已暂停',
  members: (count: number) => `${count} 位成员`,
  state: {
    idle: '空闲',
    thinking: '思考中',
    working: '工作中',
    waiting: '等你处理',
    blocked: '受阻',
  },
  connectTitle: '连接你的电脑',
  connectHint: '开发版：填入电脑在 tailnet 上的地址，以及 dsh web 打印的启动令牌。',
  hostAddress: '电脑地址',
  launchToken: '启动令牌',
  connect: '连接',
  unpair: '取消配对',
};

const locale = Intl.DateTimeFormat().resolvedOptions().locale;

export const t = locale.toLowerCase().startsWith('zh') ? zh : en;
