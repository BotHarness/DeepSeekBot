export const en = {
  pinnedTabFixture: {
    title: 'Pinned tab prototypes',
    pinnedSelected: 'Pinned tab selected',
    chatsSelected: 'Chats selected',
    channelUnread: 'Channel, unread',
    tabLabel: (name: string) => `${name}, pinned tab`,
    unread: (count: string) => `${count} unread`,
    stewardName: 'Fixture Steward',
    channelName: 'Fixture Launch',
  },
};

export const zh: typeof en = {
  pinnedTabFixture: {
    title: '固定标签页原型',
    pinnedSelected: '已选中固定标签页',
    chatsSelected: '已选中聊天',
    channelUnread: '频道，有未读',
    tabLabel: (name: string) => `${name}，固定标签页`,
    unread: (count: string) => `${count} 条未读`,
    stewardName: 'Fixture Steward',
    channelName: 'Fixture Launch',
  },
};
