const fileCount = (count: number) => (count === 1 ? '1 file' : `${count} files`);
const messageCount = (count: number) => (count === 1 ? '1 message' : `${count} messages`);

export const en = {
  storage: {
    title: 'Storage',
    hint: 'Space used on this computer',
    total: (size: string) => `${size} used`,
    part: {
      media: 'Media and files',
      messages: 'Messages',
      memory: 'Memory',
      other: 'Other',
    },
    clearHeading: 'Clear chat media',
    textKept: 'Only images, video, audio and files are deleted. Text messages stay.',
    olderThan: 'Older than',
    age: {
      '30': '30 days',
      '90': '90 days',
      '180': '180 days',
      '365': '1 year',
      all: 'Any age',
    },
    kinds: 'Types',
    kind: { image: 'Images', video: 'Video', audio: 'Audio', file: 'Files' },
    chats: 'Chats',
    noMedia: 'No chat media yet.',
    deleted: (name: string) => `${name} (deleted)`,
    clear: 'Clear…',
    confirmTitle: 'Clear chat media?',
    confirmLead: (files: number, messages: number, size: string) =>
      `Deletes ${fileCount(files)} from ${messageCount(messages)} and frees about ${size}. This cannot be undone.`,
    shared: 'Some files are still used elsewhere. They are only removed from these messages.',
    kept: {
      'bot-working': (files: number) =>
        files === 1
          ? '1 file is kept for now because a Bot is still working on it.'
          : `${files} files are kept for now because a Bot is still working on them.`,
      'delivery-pending': (files: number) =>
        files === 1
          ? '1 file is kept for now because it is still being sent.'
          : `${files} files are kept for now because they are still being sent.`,
      memory: (files: number) =>
        files === 1
          ? '1 file is kept because Memory uses it.'
          : `${files} files are kept because Memory uses them.`,
      migration: (files: number) =>
        files === 1
          ? '1 file is still being moved. Try again later.'
          : `${files} files are still being moved. Try again later.`,
    },
    confirm: 'Clear',
    nothing: 'Nothing matches. Choose an older range, more types or more chats.',
    done: (files: number, size: string) => `Cleared ${fileCount(files)} and freed ${size}.`,
    stale: 'Something changed since the preview. Try again.',
    failed: 'Could not clear.',
    phone: 'This phone',
    imageCache: 'Clear saved media',
    imageCacheAction: 'Clear saved media…',
    imageCacheHint: 'Images saved on this phone download again when you open them.',
    imageCacheDone: 'Saved media cleared.',
    imageCacheConfirmTitle: 'Clear saved media?',
    imageCacheConfirmBody:
      'Images and files saved on this phone from this computer are deleted. They download again when you open them. Nothing is deleted on the computer.',
    imageCacheConfirm: 'Clear',
    imageCacheFailed: 'Could not clear the image cache. Try again.',
    phoneSaved: 'Saved from this computer',
    phoneChats: 'Chat history',
    chatsAction: 'Clear chat history on this phone…',
    chatsConfirmTitle: 'Clear chat history?',
    chatsConfirmBody:
      'Messages saved on this phone from this computer are deleted. They load again from the computer when you open a chat. Nothing is deleted on the computer.',
    chatsConfirm: 'Clear',
    chatsDone: 'Chat history cleared.',
    phoneAuto: 'Delete media not opened for 30 days',
    phoneAutoHint:
      'Images and files saved on this phone download again from the computer when you open them. Nothing is deleted on the computer.',
    phoneOlder: 'Not opened for',
    phoneOlderAction: 'Delete unopened media…',
    phoneOlderTitle: 'Delete saved media?',
    phoneOlderConfirm: 'Delete',
    phoneOlderNothing: 'Nothing saved on this phone is that old.',
    phoneOlderLead: (files: number, size: string) =>
      `Deletes ${fileCount(files)} saved on this phone and frees ${size}. They download again from the computer when you open them. Nothing is deleted on the computer.`,
    phoneOlderDone: (files: number, size: string) =>
      files === 0 ? 'Nothing to delete.' : `Deleted ${fileCount(files)} and freed ${size}.`,
    target: 'Clear',
    targetMedia: 'Chat media',
    targetMessages: 'Whole messages',
    messages: {
      heading: 'Clear old messages',
      note: 'Deletes whole messages, including their text and files. Bot Memory is not changed.',
      none: 'No chat messages yet.',
      count: (count: number) => messageCount(count),
      confirmTitle: 'Delete old messages?',
      lead: (messages: number, chats: number, size: string) =>
        `Deletes ${messageCount(messages)} from ${chats === 1 ? '1 chat' : `${chats} chats`}, about ${size}. This cannot be undone.`,
      files: (files: number) =>
        `${fileCount(files)} in them ${files === 1 ? 'is' : 'are'} deleted too.`,
      memory: (count: number) =>
        `Bot Memory mentions these messages ${count === 1 ? 'once' : `${count} times`}. Memory is not changed.`,
      more: 'More old messages remain. Clear again after this one.',
      kept: {
        'bot-working': (messages: number) =>
          messages === 1
            ? '1 message is kept for now because a Bot is still working on it.'
            : `${messages} messages are kept for now because a Bot is still working on them.`,
        'delivery-pending': (messages: number) =>
          messages === 1
            ? '1 message is kept for now because it is still being sent.'
            : `${messages} messages are kept for now because they are still being sent.`,
        shared: (messages: number) =>
          messages === 1
            ? '1 message is kept because it also appears in a chat you did not choose.'
            : `${messages} messages are kept because they also appear in chats you did not choose.`,
      },
      confirm: 'Delete',
      nothing: 'Nothing matches. Choose an older range or more chats.',
      done: (messages: number, size: string) =>
        `Deleted ${messageCount(messages)} and freed ${size}.`,
    },
  },
};

export const zh: typeof en = {
  storage: {
    title: '存储空间',
    hint: '这台电脑上的占用空间',
    total: (size: string) => `共占用 ${size}`,
    part: {
      media: '图片和文件',
      messages: '聊天记录',
      memory: '记忆',
      other: '其他',
    },
    clearHeading: '清理聊天媒体',
    textKept: '只删除图片、视频、音频和文件，文字消息会保留。',
    olderThan: '清理多久以前的',
    age: {
      '30': '30 天前',
      '90': '90 天前',
      '180': '180 天前',
      '365': '1 年前',
      all: '全部',
    },
    kinds: '类型',
    kind: { image: '图片', video: '视频', audio: '音频', file: '文件' },
    chats: '聊天',
    noMedia: '聊天里还没有图片或文件。',
    deleted: (name: string) => `${name}（已删除）`,
    clear: '清理…',
    confirmTitle: '清理聊天媒体？',
    confirmLead: (files: number, messages: number, size: string) =>
      `会从 ${messages} 条消息里删除 ${files} 个文件，释放约 ${size}。无法撤销。`,
    shared: '部分文件在别处仍在使用，只会从这些消息里移除。',
    kept: {
      'bot-working': (files: number) => `${files} 个文件 Bot 还在处理，这次先保留。`,
      'delivery-pending': (files: number) => `${files} 个文件还在发送中，这次先保留。`,
      memory: (files: number) => `${files} 个文件被记忆引用，会保留。`,
      migration: (files: number) => `${files} 个文件还在整理中，稍后再试。`,
    },
    confirm: '清理',
    nothing: '没有符合条件的媒体。可以选更早的时间、更多类型或聊天。',
    done: (files: number, size: string) => `已清理 ${files} 个文件，释放 ${size}。`,
    stale: '预览之后内容有变化，再试一次。',
    failed: '清理失败。',
    phone: '这台手机',
    imageCache: '清除已保存的媒体',
    imageCacheAction: '清除已保存的媒体…',
    imageCacheHint: '保存在这台手机上的图片，下次打开时会重新下载。',
    imageCacheDone: '已保存的媒体已清除。',
    imageCacheConfirmTitle: '清除已保存的媒体？',
    imageCacheConfirmBody:
      '会删除这台手机上从这台电脑保存的图片和文件，再次打开时会重新下载。电脑上的内容不受影响。',
    imageCacheConfirm: '清除',
    imageCacheFailed: '没能清除图片缓存，再试一次。',
    phoneSaved: '从这台电脑保存的内容',
    phoneChats: '聊天记录',
    chatsAction: '清除这台手机上的聊天记录…',
    chatsConfirmTitle: '清除聊天记录？',
    chatsConfirmBody:
      '会删除这台手机上从这台电脑保存的聊天消息，再次打开聊天时会从电脑重新加载。电脑上的内容不受影响。',
    chatsConfirm: '清除',
    chatsDone: '聊天记录已清除。',
    phoneAuto: '自动删除 30 天未打开的媒体',
    phoneAutoHint:
      '保存在这台手机上的图片和文件，再次打开时会从电脑重新下载。电脑上的内容不会被删除。',
    phoneOlder: '未打开时长',
    phoneOlderAction: '删除未打开的媒体…',
    phoneOlderTitle: '删除已保存的媒体？',
    phoneOlderConfirm: '删除',
    phoneOlderNothing: '这台手机上没有这么久未打开的媒体。',
    phoneOlderLead: (files: number, size: string) =>
      `将删除这台手机上保存的 ${files} 个文件，释放 ${size}。再次打开时会从电脑重新下载。电脑上的内容不会被删除。`,
    phoneOlderDone: (files: number, size: string) =>
      files === 0 ? '没有可删除的内容。' : `已删除 ${files} 个文件，释放 ${size}。`,
    target: '清理内容',
    targetMedia: '聊天媒体',
    targetMessages: '整条消息',
    messages: {
      heading: '清理旧聊天记录',
      note: '删除整条消息，包括文字和文件。Bot 的记忆不受影响。',
      none: '还没有聊天消息。',
      count: (count: number) => `${count} 条消息`,
      confirmTitle: '删除旧消息？',
      lead: (messages: number, chats: number, size: string) =>
        `会删除 ${chats} 个聊天里的 ${messages} 条消息，约 ${size}。删除后无法恢复。`,
      files: (files: number) => `其中的 ${files} 个文件也会一起删除。`,
      memory: (count: number) => `有 ${count} 处 Bot 记忆提到了这些消息，记忆不会改动。`,
      more: '还有更多旧消息，这次完成后再清理一次。',
      kept: {
        'bot-working': (messages: number) => `${messages} 条消息 Bot 还在处理，这次先保留。`,
        'delivery-pending': (messages: number) => `${messages} 条消息还在发送中，这次先保留。`,
        shared: (messages: number) => `${messages} 条消息也出现在你没选的聊天里，会保留。`,
      },
      confirm: '删除',
      nothing: '没有符合条件的消息。可以选更早的时间或更多聊天。',
      done: (messages: number, size: string) => `已删除 ${messages} 条消息，释放 ${size}。`,
    },
  },
};
