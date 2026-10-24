import { panelLayoutGuide } from './help-panel-layout.js';
import { panelLocationGuide } from './help-panel-location.js';
import type { ClientHelpService, HelpQuestion } from '../help-api.js';
import type { DockPanelHost } from './dock-panels.js';

const recipes: Readonly<Record<string, readonly [string, string, string, string]>> = {
  'bh:channels': [
    'How do I switch conversations?',
    '如何切换对话？',
    'Open Channels and select a Bot or group. Messages and channel panels follow that selection; global panels remain available. Each conversation keeps its own draft.',
    '打开频道面板，选择 Bot 或群组。消息及频道面板会跟随所选对话，全局面板仍可继续使用。各个对话分别保留草稿。',
  ],
  'bh:home': [
    'Where can I ask Tob for help?',
    '在哪里向托布求助？',
    'Open Home to write a request to Tob. Review the message before sending. The Ask Tob action in a FAQ instead opens the existing DM with a draft; it never sends automatically or overwrites an existing draft.',
    '打开首页可向托布提出请求，确认内容后再发送。FAQ 中的「问托布」则会打开已有私聊并准备草稿，不会自动发送，也不会覆盖已有草稿。',
  ],
  'bh:channel-body': [
    'How do I send a message?',
    '如何发送消息？',
    'Open a conversation, type in the message box, then use Send. Switching conversations keeps each conversation’s draft separate. The controls below the box let you review the current model before sending.',
    '打开一个对话，在输入框写好内容后点击发送。切换对话时，各个对话的草稿分别保留。发送前可在输入框下方查看当前模型。',
  ],
  'memory-files': [
    'Where can I read a Bot’s memory?',
    '在哪里查看 Bot 的记忆？',
    'Open the Bot’s conversation and its Memory files panel. Choose a file to read it. Check that you selected the intended Bot before editing its memory.',
    '打开这个 Bot 的私聊，再打开记忆文件面板。选择文件即可阅读；修改前先确认当前选择的是你想操作的 Bot。',
  ],
  'memory-evolution': [
    'How do I review memory changes?',
    '如何查看记忆变化？',
    'Open Memory evolution for the selected Bot and choose a recorded version to inspect its changes. Reviewing a version does not restore it; use the separate recovery controls only when you intend to change memory.',
    '打开当前 Bot 的记忆演化，选择已记录的版本查看变化。查看版本不会恢复记忆；只有需要修改当前记忆时，才使用单独的恢复操作。',
  ],
  sessions: [
    'Where can I see a Bot’s tasks?',
    '在哪里查看 Bot 的任务？',
    'Open Sessions in the conversation. Select a session to inspect its messages and activity. Use the panel’s target selector to distinguish the current channel from a Bot’s sessions.',
    '在对话中打开会话面板，选择一个会话查看消息和活动。通过面板里的目标选择器区分当前频道与 Bot 的会话。',
  ],
  'bot-inbox': [
    'What is in the Bot inbox?',
    'Bot 收件箱里有什么？',
    'Open the Bot inbox in a Bot conversation to inspect incoming events and their processing state. Switch between time and source views to find the event you need. This is separate from the message draft you write.',
    '在 Bot 私聊中打开收件箱，查看收到的事件及处理状态。可按时间或来源查看，找到需要的事件。收件箱与输入框中的消息草稿是分开的。',
  ],
  schedules: [
    'Where can I inspect scheduled work?',
    '在哪里查看定时任务？',
    'Open Schedules for the intended Bot. Review a schedule’s timing and state before changing or removing it. Closing the panel does not stop scheduled work.',
    '选择目标 Bot 后打开定时任务面板。修改或删除前，先查看任务的执行时间与状态。关闭面板不会停止定时任务。',
  ],
  members: [
    'How do I see who belongs to a group?',
    '如何查看群组成员？',
    'Open a group conversation, then Members. Check the current member list before adding or removing a Bot. The selected group determines which membership you are changing.',
    '打开群聊，再打开成员面板。添加或移除 Bot 前先查看当前成员；成员操作只针对当前选择的群组。',
  ],
  'activity-center': [
    'Where can I review activity across conversations?',
    '在哪里查看各个对话的活动？',
    'Open Activity from the control rail to review activity across conversations. Open an item to inspect its associated conversation. Activity is a global panel, so it is not limited to the currently selected Bot.',
    '从侧边控制栏打开活动面板，查看各个对话的活动。打开条目可查看相关对话。活动是全局面板，不只显示当前 Bot。',
  ],
  'bot-market': [
    'How do I find available additions?',
    '如何查找可添加的内容？',
    'Open Market, choose a category or search, and read an item’s details before installing it. Check its requirements and permissions; opening an item does not install it.',
    '打开市场，选择分类或搜索，先阅读条目详情再安装。留意所需条件与权限；打开详情不会执行安装。',
  ],
  'botharness-browser': [
    'How do I inspect a Bot’s browser?',
    '如何查看 Bot 的浏览器？',
    'Open a Bot conversation, then its Browser panel. Choose the browser or tab you want to inspect. The panel belongs to that Bot; check the selected Bot before interacting with a page.',
    '打开 Bot 私聊，再打开浏览器面板，选择要查看的浏览器或标签页。面板对应当前 Bot；操作网页前先确认选择的 Bot。',
  ],
  'botharness-computer': [
    'How do I view a Bot’s computer?',
    '如何查看 Bot 的电脑？',
    'Open a Bot conversation, then Computer. Check the selected environment and its connection state before interacting with the screen. Closing the view does not by itself shut down the environment.',
    '打开 Bot 私聊，再打开电脑面板。操作屏幕前先确认所选环境及连接状态。仅关闭视图不会关闭运行环境。',
  ],
};

export function installPanelHelp(help: ClientHelpService, panels: DockPanelHost): () => void {
  let signature = '';
  let updating = false;
  let dispose = () => {};
  const reconcile = () => {
    if (updating) return;
    const contributed = new Set(
      help
        .topics()
        .filter((topic) => !topic.id.startsWith('botharness:panel-help:'))
        .map((topic) => topic.panelId),
    );
    const entries = panels
      .panels()
      .filter(
        (panel) =>
          panel.id !== 'user-guide' &&
          !panel.id.startsWith('instance:') &&
          !contributed.has(panel.id),
      );
    const next = JSON.stringify(entries.map((panel) => [panel.id, panel.title]));
    if (next === signature) return;
    signature = next;
    updating = true;
    try {
      dispose();
      dispose = help.register({
        id: 'botharness:panel-help',
        topics: entries.map((panel) => {
          const recipe = recipes[panel.id];
          const questions: HelpQuestion[] = [
            {
              id: `botharness:panel-help:${panel.id}:open`,
              title: { en: `How do I open ${panel.title}?`, zh: `如何打开${panel.title}？` },
              answer: {
                en:
                  panel.scope === 'global'
                    ? `Open the panel switcher and choose ${panel.title}. This panel is global and can stay open when you switch conversations.`
                    : `Select the relevant conversation, then choose ${panel.title} in the panel switcher. If it is unavailable, check whether you have selected a Bot conversation or a group and whether the plugin is enabled.`,
                zh:
                  panel.scope === 'global'
                    ? `打开面板切换器，选择「${panel.title}」。这是全局面板，切换对话时可以继续查看。`
                    : `先选择相关对话，再从面板切换器选择「${panel.title}」。如果不可用，请检查当前选择的是 Bot 私聊还是群聊，以及对应插件是否启用。`,
              },
            },
          ];
          if (recipe)
            questions.push({
              id: `botharness:panel-help:${panel.id}:use`,
              title: { en: recipe[0], zh: recipe[1] },
              answer: { en: recipe[2], zh: recipe[3] },
            });
          questions.push({
            id: `botharness:panel-help:${panel.id}:layout`,
            title: { en: 'How do I rearrange or hide this panel?', zh: '如何调整或隐藏这个面板？' },
            answer: {
              en: 'Drag the icon at the left of the panel header to dock it beside another panel, or drag a divider to resize it. Use the panel’s close control to hide it, then reopen it from the panel switcher. These ordinary layout changes are saved; a guide’s temporary enlargement is restored when the guide ends.',
              zh: '拖动面板标题左侧的图标可调整停靠位置，拖动分隔线可调整大小。点击面板的关闭按钮即可隐藏，之后可从面板切换器重新打开。普通布局调整会保存；教程中的临时放大会在教程结束后归位。',
            },
          });
          return {
            id: `botharness:panel-help:${panel.id}`,
            panelId: panel.id,
            title: { en: panel.title, zh: panel.title },
            overview: recipe
              ? { en: recipe[2], zh: recipe[3] }
              : {
                  en: 'This panel has no authored help yet. The questions below explain common panel controls.',
                  zh: '此面板暂未提供专属帮助。以下问题介绍通用面板操作。',
                },
            questions: questions.map((question) => ({
              ...question,
              guide:
                question.id.endsWith(':layout') && panel.scope === 'global'
                  ? panelLayoutGuide(panels, panel, () => help.cancel('context-changed'))
                  : panelLocationGuide(panels, panel, () => help.cancel('context-changed')),
            })),
          };
        }),
      });
    } finally {
      updating = false;
    }
  };
  const offPanels = panels.subscribe(reconcile);
  const offHelp = help.subscribe(reconcile);
  reconcile();
  return () => {
    offPanels();
    offHelp();
    dispose();
  };
}
