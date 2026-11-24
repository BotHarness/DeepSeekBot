export const en = {
  pinnedTab: {
    title: 'Pinned',
    tabLabel: (name: string, unread?: string) =>
      unread === undefined ? `${name}, pinned tab` : `${name}, pinned tab, ${unread} unread`,
    emptyTitle: 'Nothing to pin yet',
    emptyBody: 'Add a computer and its Steward appears here.',
    emptyAction: 'Add a computer',
  },
};

export const zh: typeof en = {
  pinnedTab: {
    title: '固定',
    tabLabel: (name: string, unread?: string) =>
      unread === undefined ? `${name}，固定标签页` : `${name}，固定标签页，${unread} 条未读`,
    emptyTitle: '还没有可固定的对话',
    emptyBody: '添加电脑后，它的主管会出现在这里。',
    emptyAction: '添加电脑',
  },
};
