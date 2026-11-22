export type ViewerLocale = 'zh' | 'en';

export interface ViewerStrings {
  readonly title: string;
  readonly trackpadOn: string;
  readonly directTap: string;
  readonly hintTrackpad: string;
  readonly hintDirect: string;
  readonly done: string;
  readonly failed: string;
  readonly leftClick: string;
  readonly rightClick: string;
  readonly scrollUp: string;
  readonly scrollDown: string;
  readonly keyboard: string;
  readonly takeOver: string;
  readonly release: string;
  readonly overlayCta: string;
  readonly navDirect: string;
  readonly navTrack: string;
  readonly missingSlug: string;
  readonly browserNotRunning: string;
  readonly waitingForFrame: string;
  readonly noBrowserTab: string;
  readonly frameUnavailable: string;
  readonly inputUnavailable: string;
  readonly pauseRequired: string;
  readonly inputFailed: string;
  readonly handoffExpired: string;
  readonly handoffUnavailable: string;
  readonly handoffDone: string;
  readonly requesting: string;
  readonly takingOver: string;
  readonly releasing: string;
  readonly statusUnavailable: string;
  readonly takeoverUnavailable: string;
  readonly releaseUnavailable: string;
  readonly handoffInProgress: string;
}

export const VIEWER_STRINGS: Record<ViewerLocale, ViewerStrings> = {
  en: {
    title: 'Bot Browser',
    trackpadOn: 'Trackpad: on',
    directTap: 'Direct tap',
    hintTrackpad: 'Swipe moves the cursor, tap clicks, long-press right-clicks',
    hintDirect: 'Tap clicks, long-press right-clicks, swipe scrolls, type on your keyboard',
    done: 'Done',
    failed: 'Could not finish',
    leftClick: 'Left Click',
    rightClick: 'Right Click',
    scrollUp: '▲ Scroll',
    scrollDown: '▼ Scroll',
    keyboard: '⌨ Keyboard',
    takeOver: 'Take over',
    release: 'Release',
    overlayCta: '👆 Tap to take over and operate',
    navDirect: 'Direct tap',
    navTrack: 'Trackpad',
    missingSlug: 'missing slug',
    browserNotRunning: 'browser not running',
    waitingForFrame: 'Waiting for the first frame…',
    noBrowserTab: 'No browser tab',
    frameUnavailable: 'frame unavailable',
    inputUnavailable: 'input unavailable',
    pauseRequired: 'Pause the bot in the Browser entry, then act',
    inputFailed: 'input failed',
    handoffExpired: 'handoff link expired or already used',
    handoffUnavailable: 'handoff link unavailable',
    handoffDone: 'Reported, the bot will verify',
    requesting: 'requesting takeover…',
    takingOver: 'taking over…',
    releasing: 'releasing…',
    statusUnavailable: 'takeover status unavailable',
    takeoverUnavailable: 'takeover unavailable',
    releaseUnavailable: 'release unavailable',
    handoffInProgress: 'handoff in progress, finishing keeps pause',
  },
  zh: {
    title: 'Bot 浏览器',
    trackpadOn: '触控板：开',
    directTap: '直接点按',
    hintTrackpad: '滑动移动光标，轻点点击，长按右键',
    hintDirect: '点按点击，长按右键，滑动滚动，用键盘直接输入',
    done: '完成',
    failed: '无法完成',
    leftClick: '左键点击',
    rightClick: '右键点击',
    scrollUp: '▲ 上滚',
    scrollDown: '▼ 下滚',
    keyboard: '⌨ 键盘',
    takeOver: '接管',
    release: '取消接管',
    overlayCta: '👆 点击接管，直接操作',
    navDirect: '直接点按',
    navTrack: '触控板',
    missingSlug: '缺少 slug',
    browserNotRunning: '浏览器未运行',
    waitingForFrame: '正在等待首帧…',
    noBrowserTab: '没有浏览器标签页',
    frameUnavailable: '画面不可用',
    inputUnavailable: '输入不可用',
    pauseRequired: '先接管再操作',
    inputFailed: '输入失败',
    handoffExpired: '接管链接已过期或已使用',
    handoffUnavailable: '接管链接不可用',
    handoffDone: '已提交，Bot 会校验',
    requesting: '正在请求接管…',
    takingOver: '正在接管…',
    releasing: '正在释放…',
    statusUnavailable: '接管状态不可用',
    takeoverUnavailable: '接管不可用',
    releaseUnavailable: '释放不可用',
    handoffInProgress: '交接进行中，保持暂停',
  },
};

export function viewerLocaleOf(
  headers: Record<string, string | string[] | undefined>,
): ViewerLocale {
  const raw = headers['accept-language'];
  const first = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  return first.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
