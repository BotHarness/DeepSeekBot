import type { ConversationStateView, BotSummary, ChannelSummary } from '../../store.js';
import { useScopedState } from '../../scoped-state.js';
import { useDmComposerContext } from '../../dm-composer-context.js';
import { useGroupComposerContext } from '../../group-composer-context.js';
import type { WindowCompanions } from '../../window-companions.js';
import { BridgeCallError, type ProfileActivity } from '../../bridge.js';
import type { ComposerShortcut } from '../../composer-shortcuts.js';
import { useRef } from 'react';
import type { BridgeActions } from '../../actions.js';
import { personaBotPresentationSummary, type PersonaBotFacepileItem } from '../../avatar.js';
import type { ChannelComposerActivity, ChannelComposerProps } from '../../channel-composer.js';
import type { BotHarnessTranslate } from '../../locale.js';
import { personaBotActivity } from '../../persona-activity.js';
import { groupComposerActivity } from '../../group-composer-activity.js';
import { attentionCount } from '../../activity-attention.js';
import { useFooterPreferences } from '../../composer-footer-preferences.js';
import { useReplyPerf } from '../../use-reply-perf.js';

export function useConversationComposerContext({
  actions,
  channelId,
  state,
  scopeKey,
  channel,
  readOnlyDm,
  profileBot,
  companion,
  profileActivity,
  profileUsageLoading,
  t,
  channelBots,
  onUsage,
}: {
  actions: BridgeActions;
  channelId: string | undefined;
  state: ConversationStateView;
  scopeKey: string;
  channel: ChannelSummary | undefined;
  readOnlyDm: boolean;
  profileBot: BotSummary | undefined;
  companion: WindowCompanions | undefined;
  profileActivity: ProfileActivity | undefined;
  profileUsageLoading: boolean;
  t: BotHarnessTranslate;
  channelBots: BotSummary[];
  onUsage: () => void;
}) {
  const footerPreferences = useFooterPreferences();
  const { mount: replyPerfMount, average: avgPerf } = useReplyPerf(
    actions,
    channelId,
    state.channels.find((item) => item.id === channelId)?.latestMessage,
    !footerPreferences.hidden.includes('avg-perf'),
    state.contentPurgeRevision ?? 0,
  );
  const dmComposerContext = useDmComposerContext({
    scopeKey,
    bot:
      channel?.type === 'dm' && !readOnlyDm && profileBot?.sharedBy === undefined
        ? profileBot
        : undefined,
    channelId,
    actions,
    companion,
    activity: profileActivity,
    loading: profileUsageLoading,
    t,
    avgPerf,
    onUsage,
  });

  const groupComposerContext = useGroupComposerContext({
    scopeKey,
    channel,
    members: channelBots,
    actions,
    t,
    avgPerf,
  });
  const baseComposerContext = dmComposerContext ?? groupComposerContext;

  return { replyPerfMount, dmComposerContext, baseComposerContext };
}

export function conversationComposerContext(
  baseComposerContext: ChannelComposerProps['context'],
  contextInHeader: boolean,
  conversationShortcuts: ComposerShortcut[],
  t: BotHarnessTranslate,
): ChannelComposerProps['context'] {
  return baseComposerContext === undefined
    ? undefined
    : {
        ...baseComposerContext,
        shortcuts: [
          ...(contextInHeader
            ? baseComposerContext.shortcuts.map((shortcut) =>
                shortcut.id === 'footer'
                  ? { ...shortcut, id: 'header' as const, label: t('composerHeader.settings') }
                  : shortcut,
              )
            : baseComposerContext.shortcuts),
          ...conversationShortcuts,
        ],
        ...(contextInHeader ? { content: undefined } : {}),
      };
}

export interface ComposerCompactNotice {
  seq: number;
  text: string;
  tone?: 'success';
  holdMs: number;
}

export function useComposerCompaction(scopeKey: string) {
  const [compactNotice, setCompactNotice] = useScopedState<ComposerCompactNotice>(scopeKey);
  const [compacting, setCompacting] = useScopedState(scopeKey, false);
  const compactSeq = useRef(0);
  return { compactNotice, setCompactNotice, compacting, setCompacting, compactSeq };
}

export function createComposerCompaction(
  {
    compacting,
    setCompacting,
    setCompactNotice,
    compactSeq,
  }: ReturnType<typeof useComposerCompaction>,
  profileBot: BotSummary | undefined,
  actions: BridgeActions,
  t: BotHarnessTranslate,
) {
  const compactProfileBot = async (): Promise<void> => {
    if (profileBot === undefined) return;
    const show = (text: string, holdMs: number, tone?: 'success') => {
      compactSeq.current += 1;
      setCompactNotice({
        seq: compactSeq.current,
        text,
        holdMs,
        ...(tone ? { tone } : {}),
      });
    };
    setCompacting(true);
    show(t('composerCompact.running'), 120000);
    try {
      const result = await actions.compactBot(profileBot.slug);
      const tokens = (value: number | null) => (value === null ? '?' : value.toLocaleString());
      if (result.outcome === 'compacted')
        show(
          t('composerCompact.done', {
            before: tokens(result.tokensBefore),
            after: tokens(result.tokensAfter),
          }),
          4000,
          'success',
        );
      else
        show(
          t(
            result.outcome === 'busy'
              ? 'composerCompact.busy'
              : result.outcome === 'not-loaded'
                ? 'composerCompact.notLoaded'
                : 'composerCompact.nothing',
          ),
          result.outcome === 'nothing' ? 3000 : 6000,
        );
    } catch (error) {
      show(
        t(
          error instanceof BridgeCallError && error.code === 'session-unsaved'
            ? 'failure.recoveryUnsaved'
            : 'composerCompact.failed',
        ),
        6000,
      );
    } finally {
      setCompacting(false);
    }
  };

  const newProfileSession = (): void => {
    if (!profileBot || compacting) return;
    setCompacting(true);
    void actions
      .newBotSession(profileBot.slug)
      .then(() => {
        setCompactNotice({
          seq: ++compactSeq.current,
          text: t('composerCommand.newSessionDone'),
          holdMs: 4000,
        });
      })
      .catch(() => {
        setCompactNotice({
          seq: ++compactSeq.current,
          text: t('composerCompact.failed'),
          holdMs: 6000,
        });
      })
      .finally(() => setCompacting(false));
  };

  return { compactProfileBot, newProfileSession };
}

export function conversationComposerActivity({
  state,
  channel,
  dmBot,
  channelFacepile,
  t,
}: {
  state: ConversationStateView;
  channel: ChannelSummary | undefined;
  dmBot: BotSummary | undefined;
  channelFacepile: PersonaBotFacepileItem[];
  t: BotHarnessTranslate;
}): ChannelComposerActivity | undefined {
  const activeFacepile = channelFacepile.filter(
    (item) => item.state !== 'idle' || item.attention !== undefined,
  );
  const dmBotActivity = dmBot === undefined ? undefined : personaBotActivity(state, dmBot);
  const composerFacepile: PersonaBotFacepileItem[] =
    dmBot === undefined
      ? activeFacepile
      : dmBotActivity === undefined ||
          (dmBotActivity === 'idle' && attentionCount(dmBot.attention) === 0)
        ? []
        : [
            {
              personaBotId: dmBot.slug,
              name: dmBot.displayName,
              src: dmBot.avatar,
              appearance: dmBot.appearance,
              avatarSeed: dmBot.avatarSeed,
              state: dmBotActivity,
              activity: dmBot.activity,
              attention: dmBot.attention,
              sessions: dmBot.sessionActivity,
            },
          ];
  return channel?.type === 'group'
    ? groupComposerActivity(channelFacepile, t)
    : composerFacepile.length === 0
      ? undefined
      : {
          items: composerFacepile,
          summary:
            composerFacepile.length === 1
              ? `${composerFacepile[0]?.name ?? 'PersonaBot'} ${personaBotPresentationSummary(composerFacepile[0]?.state ?? 'idle', composerFacepile[0]?.activity, composerFacepile[0]?.attention, t)}`
              : t('main.activity.bots', { count: composerFacepile.length }),
        };
}
