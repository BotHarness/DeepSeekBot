import { tapVerb } from '../../ui/platform-copy';

export const en = {
  profileBrowser: 'Browser',
  browserTitle: (name: string) => `${name}'s Browser`,
  browserClose: 'Close the Browser',
  browserLoading: 'Loading the Browser…',
  browserNotRunning: 'The Browser is not running. It appears here when the Bot opens a page.',
  browserNoAccess:
    'Browser Access is off for this Bot. Turn it on in the Bot settings on your computer.',
  browserUnreachable: 'Cannot reach the Browser on your computer.',
  browserRevoked: "Your computer revoked this phone's access.",
  browserBotDriving: 'The Bot is using the Browser. Pause it to take over.',
  browserYouDriving: 'You have the Browser. Resume to hand it back.',
  browserPause: 'Pause Bot',
  browserResume: 'Resume',
  browserDirect: 'Tap',
  browserTrackpad: 'Trackpad',
  browserKeyboard: 'Keyboard',
  browserTypeHere: 'Type to send keys',
  browserView: 'Live view of the Bot Browser',
};

export const zh: typeof en = {
  profileBrowser: '浏览器',
  browserTitle: (name: string) => `${name} 的浏览器`,
  browserClose: '关闭浏览器',
  browserLoading: '正在加载浏览器…',
  browserNotRunning: '浏览器没有运行。Bot 打开网页后会显示在这里。',
  browserNoAccess: '这个 Bot 没有开启浏览器权限。请在电脑上的 Bot 设置里开启。',
  browserUnreachable: '无法连接电脑上的浏览器。',
  browserRevoked: '你的电脑已撤销这台手机的访问权限。',
  browserBotDriving: 'Bot 正在使用浏览器。暂停它即可接管。',
  browserYouDriving: '你正在控制浏览器。点继续交还给 Bot。',
  browserPause: '暂停 Bot',
  browserResume: '继续',
  browserDirect: tapVerb.zh,
  browserTrackpad: '触控板',
  browserKeyboard: '键盘',
  browserTypeHere: '输入文字发送按键',
  browserView: 'Bot 浏览器的实时画面',
};
