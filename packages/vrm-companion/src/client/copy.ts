export const LOCALE_NS = 'botharness-vrm';

export type Loading = '' | 'signing-in';
export type Problem = '' | 'interrupted' | 'missing' | 'unavailable';
export type Failure = '' | 'pin' | 'remove';
export type Translate = (key: string, params?: Record<string, unknown>) => string;

export const en = {
  'presence.idle': 'Relaxing',
  'presence.thinking': 'Thinking',
  'presence.working': 'Working',
  'presence.waiting': 'Waiting for you',
  'presence.blocked': 'Needs a hand',
  'presence.offline': 'Offline',
  'presence.paused': 'Taking a break',
  'presence.connecting': 'Connecting…',
  'presence.stale': 'Reconnecting…',
  'loading.signingIn': '{name} is signing in',
  'loading.connecting': 'Connecting…',
  'problem.interrupted': 'The view was interrupted.',
  'problem.interrupted.action': 'Reload',
  'problem.missing': "{name} couldn't show up just now. Messages and activity still work.",
  'problem.unavailable': "3D isn't available here, but {name}'s messages and activity still work.",
  'problem.retry': 'Try again',
  'software.text':
    'This computer has no graphics acceleration, so {name} stays still here to keep the app fast. Messages and activity still work.',
  'software.action': 'Show 3D anyway',
  'failure.pin': "Couldn't pin this character. Try again?",
  'failure.remove': "Couldn't remove this panel. Try again?",
  'panel.title': 'VRM Companion',
  'panel.character': '{name} character',
  'panel.speech': 'Bot speech',
  'panel.file': 'VRM file',
  'menu.character': 'Character',
  'menu.scene': 'Scene',
  'menu.pin': 'Pin character globally',
  'menu.tour': 'Auto camera tour',
  'menu.tourStop': 'Stop camera tour',
  'menu.pick': 'Change character…',
  'menu.useDefault': 'Use default (now {name})',
  'menu.useDefaultSession': 'Use default (now {name}, this session only)',
  'menu.shading': 'Shading',
  'menu.view': 'View',
  'menu.view.desk': 'Desk view',
  'menu.view.room': 'Room view',
  'menu.view.portrait': 'Portrait view',
  'menu.view.reset': 'Reset view',
  'menu.time': 'Time',
  'menu.time.auto': 'Follow system clock',
  'menu.time.sunset': 'Sunset',
  'menu.time.night': 'Night',
  'menu.sun': 'Sunrise {sunrise} · Sunset {sunset}',
  'menu.weather': 'Weather',
  'menu.weather.clear': 'Clear',
  'menu.weather.rain': 'Rain',
  'menu.look': 'Look',
  'menu.look.lofi': 'Lo-fi look',
  'menu.look.plain': 'Plain',
  'menu.movement': 'Movement',
  'menu.move.sit': 'Sit down',
  'menu.move.stand': 'Stand up',
  'menu.move.wander': 'Walk around',
  'menu.move.stop': 'Stop walking',
  'menu.delete': 'Delete instance',
  'menu.hint': 'Drag to orbit · scroll to zoom',
};

export const zh: typeof en = {
  'presence.idle': '放松中',
  'presence.thinking': '思考中',
  'presence.working': '在忙',
  'presence.waiting': '等你回复',
  'presence.blocked': '需要帮忙',
  'presence.offline': '不在线',
  'presence.paused': '休息中',
  'presence.connecting': '连接中…',
  'presence.stale': '正在重连…',
  'loading.signingIn': '{name}正在上线',
  'loading.connecting': '连接中…',
  'problem.interrupted': '画面刚刚中断了一下。',
  'problem.interrupted.action': '重新载入',
  'problem.missing': '{name}暂时没能露面，消息和动态都不受影响。',
  'problem.unavailable': '这里暂时显示不了 3D，{name}的消息和动态都不受影响。',
  'problem.retry': '再试一次',
  'software.text':
    '这台电脑没有显卡加速，为了不让应用卡顿，{name}先在这里静静陪你。消息和动态都不受影响。',
  'software.action': '仍然开启 3D',
  'failure.pin': '没能固定这个角色，再试一次？',
  'failure.remove': '没能移除这个面板，再试一次？',
  'panel.title': 'VRM 伴侣',
  'panel.character': '{name}的角色',
  'panel.speech': 'Bot 说的话',
  'panel.file': 'VRM 文件',
  'menu.character': '角色',
  'menu.scene': '场景',
  'menu.pin': '固定为全局角色',
  'menu.tour': '自动镜头巡游',
  'menu.tourStop': '停止镜头巡游',
  'menu.pick': '更换角色…',
  'menu.useDefault': '换回默认角色（当前：{name}）',
  'menu.useDefaultSession': '换回默认角色（当前：{name}，仅本次会话）',
  'menu.shading': '着色',
  'menu.view': '视角',
  'menu.view.desk': '桌边视角',
  'menu.view.room': '房间视角',
  'menu.view.portrait': '近景',
  'menu.view.reset': '重置视角',
  'menu.time': '时间',
  'menu.time.auto': '跟随系统时间',
  'menu.time.sunset': '黄昏',
  'menu.time.night': '夜晚',
  'menu.sun': '日出 {sunrise} · 日落 {sunset}',
  'menu.weather': '天气',
  'menu.weather.clear': '晴天',
  'menu.weather.rain': '下雨',
  'menu.look': '画面风格',
  'menu.look.lofi': 'Lo-fi 风格',
  'menu.look.plain': '原始画面',
  'menu.movement': '动作',
  'menu.move.sit': '坐下',
  'menu.move.stand': '站起来',
  'menu.move.wander': '四处走走',
  'menu.move.stop': '停下来',
  'menu.delete': '删除这个面板',
  'menu.hint': '拖动旋转 · 滚轮缩放',
};

export const english: Translate = (key, params) =>
  (en[key as keyof typeof en] ?? key).replace(/\{(\w+)\}/g, (match, name: string) =>
    params && name in params ? String(params[name]) : match,
  );

type Presence = {
  available: boolean;
  paused: boolean;
  sync: string;
  activity: string;
};

export function presence(t: Translate, { available, paused, sync, activity }: Presence) {
  if (!available) return t('presence.offline');
  if (paused) return t('presence.paused');
  if (sync !== 'live') return t(sync === 'connecting' ? 'presence.connecting' : 'presence.stale');
  return activity in ACTIVITIES ? t('presence.' + activity) : activity;
}

const ACTIVITIES = { idle: 1, thinking: 1, working: 1, waiting: 1, blocked: 1 };

export function loadingText(t: Translate, loading: Loading, name: string) {
  return loading === 'signing-in' ? t('loading.signingIn', { name }) : '';
}

export function problemText(t: Translate, problem: Problem, name: string) {
  if (!problem) return undefined;
  return {
    text: t('problem.' + problem, { name }),
    action: t(problem === 'interrupted' ? 'problem.interrupted.action' : 'problem.retry'),
  };
}
