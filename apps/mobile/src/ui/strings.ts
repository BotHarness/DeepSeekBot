import * as activityCopy from '../features/activity/strings';
import * as appearanceCopy from '../features/appearance/strings';
import * as approvalsCopy from '../features/approvals/strings';
import * as assignmentsCopy from '../features/assignments/strings';
import * as avatarsCopy from '../features/avatars/strings';
import * as browserCopy from '../features/browser/strings';
import * as channelFilesCopy from '../features/channel-files/strings';
import * as channelsCopy from '../features/channels/strings';
import * as cloudCopy from '../features/cloud/strings';
import * as computerCopy from '../features/computer/strings';
import * as diagnosticsCopy from '../features/diagnostics/strings';
import * as environmentsCopy from '../features/environments/strings';
import * as environmentsPairingStringsCopy from '../features/environments/pairing-strings';
import * as genuiCopy from '../features/genui/strings';
import * as humansCopy from '../features/humans/strings';
import * as interfaceControlsCopy from '../features/interface-controls/strings';
import * as marketplaceCopy from '../features/marketplace/strings';
import * as memoryCopy from '../features/memory/strings';
import * as modelsCopy from '../features/models/strings';
import * as personabotsCopy from '../features/personabots/strings';
import * as privateInputCopy from '../features/private-input/strings';
import * as profileStorageCopy from '../features/profile-storage/strings';
import * as promptsCopy from '../features/prompts/strings';
import * as pushCopy from '../features/push/strings';
import * as releaseCopy from '../features/release/strings';
import * as schedulesCopy from '../features/schedules/strings';
import * as sessionsCopy from '../features/sessions/strings';
import * as skillsCopy from '../features/skills/strings';
import * as takeoverCopy from '../features/takeover/strings';
import * as teamCopy from '../features/team/strings';
import * as tobCopy from '../features/tob/strings';
import * as usageCopy from '../features/usage/strings';
import * as voiceCopy from '../features/voice/strings';
import * as workspacesCopy from '../features/workspaces/strings';

import { useSyncExternalStore } from 'react';
import { interfacePreferences } from './interface-preferences';

const en = {
  ...activityCopy.en,
  ...appearanceCopy.en,
  ...approvalsCopy.en,
  ...assignmentsCopy.en,
  ...avatarsCopy.en,
  ...browserCopy.en,
  ...channelFilesCopy.en,
  ...channelsCopy.en,
  ...cloudCopy.en,
  ...computerCopy.en,
  ...diagnosticsCopy.en,
  ...environmentsCopy.en,
  ...environmentsPairingStringsCopy.en,
  ...genuiCopy.en,
  ...humansCopy.en,
  ...interfaceControlsCopy.en,
  ...marketplaceCopy.en,
  ...memoryCopy.en,
  ...modelsCopy.en,
  ...personabotsCopy.en,
  ...privateInputCopy.en,
  ...profileStorageCopy.en,
  ...promptsCopy.en,
  ...pushCopy.en,
  ...releaseCopy.en,
  ...schedulesCopy.en,
  ...sessionsCopy.en,
  ...skillsCopy.en,
  ...takeoverCopy.en,
  ...teamCopy.en,
  ...tobCopy.en,
  ...usageCopy.en,
  ...voiceCopy.en,
  ...workspacesCopy.en,
  dialogFailed: 'That did not go through. Try again.',
  retry: 'Retry',
  loadFailed: 'Could not read this request:',
  tryAgain: 'Try again',
  done: 'Done',
  ago: (minutes: number) =>
    minutes < 1
      ? 'just now'
      : minutes < 60
        ? `${minutes} min ago`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)} h ago`
          : `${Math.floor(minutes / 1440)} d ago`,
  yesterday: 'Yesterday',
  copy: 'Copy',
  today: 'Today',
  copied: 'Copied',
  cancel: 'Cancel',
  remove: 'Remove',
  confirmAction: (action: string) => `${action}?`,
  copyHint: 'Long-press for Copy.',
  close: 'Close',
  chats: 'Chats',
  activity: 'Activity',
  settings: 'Settings',
  back: 'Back',
  loading: 'Loading',
  selectedChoice: 'Selected',
  create: 'New',
  showMore: 'Show more',
  showLess: 'Show less',
};

const zh: typeof en = {
  ...activityCopy.zh,
  ...appearanceCopy.zh,
  ...approvalsCopy.zh,
  ...assignmentsCopy.zh,
  ...avatarsCopy.zh,
  ...browserCopy.zh,
  ...channelFilesCopy.zh,
  ...channelsCopy.zh,
  ...cloudCopy.zh,
  ...computerCopy.zh,
  ...diagnosticsCopy.zh,
  ...environmentsCopy.zh,
  ...environmentsPairingStringsCopy.zh,
  ...genuiCopy.zh,
  ...humansCopy.zh,
  ...interfaceControlsCopy.zh,
  ...marketplaceCopy.zh,
  ...memoryCopy.zh,
  ...modelsCopy.zh,
  ...personabotsCopy.zh,
  ...privateInputCopy.zh,
  ...profileStorageCopy.zh,
  ...promptsCopy.zh,
  ...pushCopy.zh,
  ...releaseCopy.zh,
  ...schedulesCopy.zh,
  ...sessionsCopy.zh,
  ...skillsCopy.zh,
  ...takeoverCopy.zh,
  ...teamCopy.zh,
  ...tobCopy.zh,
  ...usageCopy.zh,
  ...voiceCopy.zh,
  ...workspacesCopy.zh,
  dialogFailed: '操作没有成功，再试一次。',
  retry: '重试',
  loadFailed: '读取这个请求失败：',
  tryAgain: '重试',
  done: '完成',
  ago: (minutes: number) =>
    minutes < 1
      ? '刚刚'
      : minutes < 60
        ? `${minutes} 分钟前`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)} 小时前`
          : `${Math.floor(minutes / 1440)} 天前`,
  yesterday: '昨天',
  copy: '复制',
  today: '今天',
  copied: '已复制',
  cancel: '取消',
  remove: '移除',
  confirmAction: (action: string) => `${action}？`,
  copyHint: '长按可复制。',
  close: '关闭',
  chats: '聊天',
  activity: '活动',
  settings: '设置',
  back: '返回',
  loading: '正在加载',
  selectedChoice: '已选择',
  create: '新建',
  showMore: '展开',
  showLess: '收起',
};

export let locale = interfacePreferences.getSnapshot().locale;
export let t = locale === 'zh' ? zh : en;
interfacePreferences.subscribe(() => {
  locale = interfacePreferences.getSnapshot().locale;
  t = locale === 'zh' ? zh : en;
});

export function dateLocale(): string {
  const device = new Intl.DateTimeFormat().resolvedOptions().locale;
  if (device.toLowerCase().startsWith(locale)) return device;
  return locale === 'zh' ? 'zh-CN' : 'en';
}

export function useStrings(): typeof en {
  const state = useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getSnapshot,
  );
  return state.locale === 'zh' ? zh : en;
}
export const activityStrings = { en: en.activityRow, zh: zh.activityRow };
export const callStrings = { en: en.call, zh: zh.call };
