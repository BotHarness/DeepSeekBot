import { productName } from '../../ui/product-name';

export const en = {
  interfacePreferences: {
    language: 'Language',
    appearance: 'Appearance',
    system: 'Follow system',
    light: 'Light',
    dark: 'Dark',
    local:
      'Saved on this phone. Message display applies to new replies; delivery status shows whether mentioned Bots received your message.',
    storageError: 'Could not save this choice. Try again.',
  },
  exitWebMode: 'Exit web mode',
  exitWebModeHint: 'Hold for help. Drag to move.',
  interface: 'Interface',
  hapticFeedback: {
    title: 'Haptic feedback',
    storageError: 'Could not save this choice. Toggle again to retry.',
  },
  headerModel: {
    title: 'Show model in chat header',
    detail: 'Off keeps the header to the Bot name and status.',
    storageError: 'Could not save this choice. Toggle again to retry.',
  },
  sendJump: {
    title: 'Jump to latest when sending',
    detail: 'Off keeps your place while you read earlier messages.',
    storageError: 'Could not save this choice. Toggle again to retry.',
  },
  messageDisplay: {
    title: 'Message display',
    streaming: 'Streaming',
    complete: 'Complete',
    storageError: 'This choice could not be saved. Tap an option to retry.',
  },
  appIcon: 'App icon',
  appIconDefaultHint: `The ${productName.en} portrait the app ships with`,
  appIconDeepSeekBot: productName.en,
  appIconDeepSeekBotSimple: `${productName.en} Chibi`,
  appIconDeepSeekBotSimpleHint: `The simple ${productName.en} portrait`,
  appIconFooter: 'Changes right away, with matching dark and tinted versions.',
  appIconUnsupported: 'This phone cannot change the app icon.',
  appIconFailed: 'Could not change the app icon:',
};

export const zh: typeof en = {
  interfacePreferences: {
    language: '语言',
    appearance: '外观',
    system: '跟随系统',
    light: '浅色',
    dark: '深色',
    local: '保存在这台手机上。消息显示对新回复生效；投递状态会在消息旁显示被 @ 的 Bot 是否收到。',
    storageError: '未能保存，再试一次。',
  },
  exitWebMode: '退出网页模式',
  exitWebModeHint: '按住查看说明，拖动可移开。',
  interface: '界面',
  hapticFeedback: {
    title: '触感反馈',
    storageError: '未能保存此选择，再切换一次。',
  },
  headerModel: {
    title: '在聊天顶部显示模型',
    detail: '关闭后，顶部只显示 Bot 名称和状态。',
    storageError: '未能保存此选择，再切换一次。',
  },
  sendJump: {
    title: '发送后跳到最新',
    detail: '关闭时，翻看之前的消息时发送不会离开当前位置。',
    storageError: '未能保存此选择，再切换一次。',
  },
  messageDisplay: {
    title: '消息显示',
    streaming: '流式',
    complete: '完整气泡',
    storageError: '未能保存此选择，再选一次。',
  },
  appIcon: 'App 图标',
  appIconDefaultHint: `App 自带的 ${productName.zh} 头像`,
  appIconDeepSeekBot: productName.zh,
  appIconDeepSeekBotSimple: `${productName.zh} Q 版`,
  appIconDeepSeekBotSimpleHint: `${productName.zh} 简笔头像`,
  appIconFooter: '立即生效，深色和着色主屏幕会使用对应版本。',
  appIconUnsupported: '这台手机不能更换 App 图标。',
  appIconFailed: '更换 App 图标失败：',
};
