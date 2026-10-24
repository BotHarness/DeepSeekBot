import type { ClientHelpService, HelpContribution, HelpAvailability } from '../help-api.js';
import type { BridgeActions } from './actions.js';
import type { DockPanelHost } from './dock-panels.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { store } from './store.js';
import { resolveChannelSidebarContext } from './channel-sidebar.js';
import { modelPlanOf } from './model-plan-store.js';
import { suggestConversationDraft } from './conversation-draft.js';
import type { BotHarnessTranslate } from './locale.js';

export function modelHelp(
  help: ClientHelpService,
  panels: DockPanelHost,
  actions: BridgeActions,
  t: BotHarnessTranslate,
): HelpContribution {
  const selectedBot = () => {
    const state = store.getSnapshot();
    const slug = resolveChannelSidebarContext(state)?.botSlug;
    return state.bots.find((bot) => bot.slug === slug && !bot.deleted);
  };
  const availability = (): HelpAvailability => {
    const bot = selectedBot();
    return bot && panels.available()
      ? { status: 'ready', target: { id: bot.slug, label: bot.displayName } }
      : {
          status: 'unavailable',
          reason: {
            en: 'Open a Bot conversation to try this guide.',
            zh: '请先打开一个 Bot 私聊。',
          },
        };
  };
  let pending: { slug: string; name: string; text: string; scope?: string } | undefined;
  const handoff = async (insert: boolean): Promise<'filled' | 'preserved'> => {
    if (!insert) {
      const bot = selectedBot();
      if (!bot) throw new Error('help_target_unavailable');
      pending = {
        slug: bot.slug,
        name: bot.displayName,
        text: t('guide.question', { name: bot.displayName }),
      };
    }
    const request = pending;
    if (
      !request ||
      !store.getSnapshot().bots.some((bot) => bot.slug === request.slug && !bot.deleted)
    )
      throw new Error('help_target_unavailable');
    const home = await actions.tobHome();
    if (pending !== request) throw new Error('help_request_replaced');
    await actions.refreshRoster();
    await actions.openBot(home.botSlug);
    const identity = store.getSnapshot().composerIdentity;
    const current = resolveChannelSidebarContext(store.getSnapshot());
    if (
      !identity ||
      current?.botSlug !== home.botSlug ||
      pending !== request ||
      !store.getSnapshot().bots.some((bot) => bot.slug === request.slug && !bot.deleted)
    )
      throw new Error('help_target_unavailable');
    panels.open(CHANNEL_BODY_PANEL);
    const scope = JSON.stringify([
      identity.hostId,
      identity.profileId,
      identity.humanId,
      home.channelId,
    ]);
    if (insert && request.scope !== scope) throw new Error('help_target_unavailable');
    request.scope = scope;
    return suggestConversationDraft(scope, request.text, insert);
  };
  return {
    id: 'botharness:help',
    topics: [
      {
        id: 'botharness:models',
        title: { en: 'Models', zh: '模型' },
        overview: { en: 'Choose the model used by a Bot.', zh: '选择 Bot 使用的模型。' },
        questions: [
          {
            id: 'botharness:change-model',
            title: { en: 'How do I change this Bot’s model?', zh: '如何更换这个 Bot 的模型？' },
            answer: {
              en: 'Open the model control below the message box. It changes this Bot’s conversation (Orchestrator) model from the next turn. Task (Assignment) models have their own settings; the Host default applies to Bots that inherit it. Your saved changes remain after the guide ends.',
              zh: '点击输入框下方的模型入口，更换这个 Bot 的对话模型（Orchestrator），从下一轮对话生效。任务模型（Assignment）有独立设置；全局默认模型用于继承它的 Bot。退出教程后，已保存的修改会保留。',
            },
            keywords: ['model', '模型', 'Messages', '消息', 'Orchestrator'],
            askTob: () => handoff(false),
            insertQuestion: async () => {
              await handoff(true);
            },
            guide: {
              availability,
              async prepare(slug, signal) {
                if (selectedBot()?.slug !== slug) throw new Error('help_target_unavailable');
                signal.throwIfAborted();
                const release = panels.beginGuide(() => help.cancel('context-changed'));
                try {
                  panels.open(CHANNEL_BODY_PANEL);
                  const initial = await actions.modelPlanState(slug);
                  signal.throwIfAborted();
                  if (selectedBot()?.slug !== slug) throw new Error('help_target_unavailable');
                  const anchor = (kind: string) =>
                    document.querySelector(`[data-help-model-${kind}="${CSS.escape(slug)}"]`) ??
                    undefined;
                  return {
                    dispose: release,
                    steps: [
                      {
                        title: { en: 'Open the model picker', zh: '打开模型选择器' },
                        description: {
                          en: 'Click the model below the message box, then choose Next.',
                          zh: '点击输入框下方的模型，再点击下一步。',
                        },
                        resolve: () => anchor('trigger'),
                        complete: () => !!anchor('dialog'),
                      },
                      {
                        title: { en: 'Choose a model', zh: '选择模型' },
                        description: {
                          en: 'Choose a different conversation model. Done becomes available after the change is saved. Closing the guide keeps your change.',
                          zh: '选择另一个对话模型。保存成功后即可完成教程，退出不会撤销修改。',
                        },
                        resolve: () => anchor('dialog')?.closest('[role="dialog"]') ?? undefined,
                        complete: () =>
                          (modelPlanOf(slug)?.revision ?? 0) > (initial?.revision ?? 0),
                      },
                    ],
                  };
                } catch (error) {
                  release();
                  throw error;
                }
              },
            },
          },
        ],
      },
    ],
  };
}
