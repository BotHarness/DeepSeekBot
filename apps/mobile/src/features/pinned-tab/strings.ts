export const en = {
  tabBarSettings: {
    title: 'Tab bar',
    order: 'Order',
    orderFooter: 'Drag a tab by its handle to move it. The bar follows at once.',
    orderFooterSessions:
      'Drag a tab by its handle to move it. Sessions appears here while its switch is on.',
    moveUp: (name: string) => `Move ${name} up`,
    moveDown: (name: string) => `Move ${name} down`,
    position: (index: number, count: number) => `${index} of ${count}`,
    reset: 'Restore default order',
    pinned: 'Pinned tab',
    conversation: 'Conversation',
    pinnedFooter: (computer: string) => `Each computer keeps its own. Showing ${computer}.`,
    pinnedFooterNone: 'Pair a computer to choose a conversation.',
    defaultChoice: 'Default',
    defaultDetail: (name: string) => `Tob, or your latest chat: ${name}`,
    pickerTitle: 'Pinned conversation',
    pickerEmpty: 'No conversations on this computer yet.',
  },
  pinnedTab: {
    title: 'Pinned',
    tabLabel: (name: string, unread?: string) =>
      unread === undefined ? `${name}, pinned tab` : `${name}, pinned tab, ${unread} unread`,
    emptyTitle: 'Nothing to pin yet',
    emptyBody: 'Add a computer and its Tob appears here.',
    emptyAction: 'Add a computer',
    loading: 'Loading the pinned conversation',
    loadFailed: 'Could not reach this computer.',
  },
};

export const zh: typeof en = {
  tabBarSettings: {
    title: '标签栏',
    order: '顺序',
    orderFooter: '按住把手拖动即可调整标签顺序，标签栏会立即更新。',
    orderFooterSessions: '按住把手拖动即可调整标签顺序。打开 Sessions 开关后，它会出现在这里。',
    moveUp: (name: string) => `上移 ${name}`,
    moveDown: (name: string) => `下移 ${name}`,
    position: (index: number, count: number) => `第 ${index} 个，共 ${count} 个`,
    reset: '恢复默认顺序',
    pinned: '固定标签页',
    conversation: '对话',
    pinnedFooter: (computer: string) => `每台电脑分别保存。当前显示：${computer}。`,
    pinnedFooterNone: '配对电脑后即可选择对话。',
    defaultChoice: '默认',
    defaultDetail: (name: string) => `Tob 或最近的对话：${name}`,
    pickerTitle: '固定的对话',
    pickerEmpty: '这台电脑上还没有对话。',
  },
  pinnedTab: {
    title: '固定',
    tabLabel: (name: string, unread?: string) =>
      unread === undefined ? `${name}，固定标签页` : `${name}，固定标签页，${unread} 条未读`,
    emptyTitle: '还没有可固定的对话',
    emptyBody: '添加电脑后，它的 Tob 会出现在这里。',
    emptyAction: '添加电脑',
    loading: '正在载入固定的对话',
    loadFailed: '连不上这台电脑。',
  },
};
