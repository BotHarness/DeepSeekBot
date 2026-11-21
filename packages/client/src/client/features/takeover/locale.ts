export const zh = {
  'takeover.label.computer': '接管电脑',
  'takeover.label.browser': '接管浏览器',
  'takeover.pending': '需要你',
  'takeover.outcome.done': '已完成',
  'takeover.outcome.failed': '无法完成',
  'takeover.outcome.cancelled': '已取消',
  'takeover.outcome.expired': '已过期',
  'takeover.open': '接管',
  'takeover.done': '完成',
  'takeover.failed': '无法完成',
  'takeover.cancel': '不需要了',
  'takeover.expiresAt': '{time} 前有效',
  'takeover.note': '密码只在实时画面里输入，不要发到聊天里。完成后点“完成”，Bot 会重新查看并继续。',
  'takeover.unavailable': '这个视图不在当前窗口，请从 Bot 的侧栏打开。',
} as const;

export const en = {
  'takeover.label.computer': 'Take over the computer',
  'takeover.label.browser': 'Take over the browser',
  'takeover.pending': 'Needs you',
  'takeover.outcome.done': 'Done',
  'takeover.outcome.failed': "Couldn't finish",
  'takeover.outcome.cancelled': 'Cancelled',
  'takeover.outcome.expired': 'Expired',
  'takeover.open': 'Take over',
  'takeover.done': 'Done',
  'takeover.failed': "Couldn't finish",
  'takeover.cancel': 'Not needed',
  'takeover.expiresAt': 'Open until {time}',
  'takeover.note':
    'Type passwords only in the live view, never in chat. Press Done when finished; the Bot checks again and continues.',
  'takeover.unavailable': 'This view is not in this window; open it from the Bot sidebar.',
} satisfies Record<keyof typeof zh, string>;
