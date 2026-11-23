import { MessageSelectionRow } from './message-selection-ui';
import { SessionFailureCard } from './session-failure-card';
import type { useRouter, useNavigationContainerRef } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import type { RosterBot } from '@botharness/host-client/client';
import type { WireSessionLink } from '@botharness/host-protocol/wire';
import { useInbox } from '../../host/host-session';
import { readingBots } from '../../host/delivery-receipt';
import { type ConversationMessage } from '@botharness/host-client/conversation';
import { ActivityRow } from './activity-row';
import { CallRecordBubble } from './call-record';
import { BADGE_OVERLAP } from './bubble-shape';
import {
  nativeChatRecycler,
  type NativeRowAction,
  type SpeakerRowSlot,
} from '../primitives/chat-list';
import { haptic } from '../haptics';
import { nativeMarkdownStyle } from '../native-markdown-style';
import { nativeTextRow, nativeTextStyle, nativeTouchStyle } from './native-text-row';
import { useBotNames } from './use-bot-names';
import { PlaybackBubble, type Speaker } from './message-bubble';
import { SpeakerAvatar } from './speaker-row';
import { TimeSeparator } from './time-separator';
import { pressTint, type useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { navigateChannel } from '../shell/channel-navigation';
import type { useStrings } from '../strings';
import type { useConversationSource } from './conversation-source';
import type {
  useConversationMessageState,
  useConversationMessageActions,
} from './conversation-message-actions';
import type { useConversationTimeline, useConversationTimelineRows } from './conversation-timeline';
import type { useConversationComposer } from './conversation-composition';
import type { Row } from './conversation-focus';
import { TurnModelSwitchMarker } from './turn-model-switch';
import { REQUEST_CARDS, RequestCard } from './conversation-request-card';
import type { SessionLinkNeed } from './session-link-chips';
import { sessionRoute } from './session-navigation';

export function useIdentityBots(bots: readonly RosterBot[] | undefined): RosterBot[] | undefined {
  const last = useRef<{ key: string; bots: RosterBot[] | undefined }>(undefined);
  const key = JSON.stringify(
    bots?.map(
      ({
        state: _state,
        activity: _activity,
        sessions: _sessions,
        preview: _preview,
        previewAt: _previewAt,
        previewAuthor: _previewAuthor,
        latestMessageId: _latestMessageId,
        ...identity
      }) => identity,
    ),
  );
  if (last.current === undefined || last.current.key !== key)
    last.current = { key, bots: bots === undefined ? undefined : [...bots] };
  return last.current.bots;
}

export function useConversationRowRendering({
  focused,
  t,
  theme,
  router,
  focus,
  openReply,
  navigation,
  android,
  source,
  messageState,
  timeline,
  composer,
  timelineRows,
  messageActions,
}: {
  focused: boolean;
  t: ReturnType<typeof useStrings>;
  theme: ReturnType<typeof useDesignTheme>;
  router: ReturnType<typeof useRouter>;
  focus: string | undefined;
  openReply: (message: string) => void;
  navigation: ReturnType<typeof useNavigationContainerRef>;
  android: boolean;
  source: ReturnType<typeof useConversationSource>;
  messageState: Pick<
    ReturnType<typeof useConversationMessageState>,
    'setViewing' | 'actionsFor' | 'setActionsFor' | 'selected' | 'togglePicked' | 'menuCatalog'
  >;
  timeline: Pick<
    ReturnType<typeof useConversationTimeline>,
    'answered' | 'resolutions' | 'latestMessageId' | 'groupOf' | 'latest'
  >;
  composer: Pick<
    ReturnType<typeof useConversationComposer>,
    'online' | 'composable' | 'startReply'
  >;
  timelineRows: ReturnType<typeof useConversationTimelineRows>;
  messageActions: ReturnType<typeof useConversationMessageActions>;
}) {
  const {
    client,
    inbox,
    saved,
    host,
    dm,
    slug,
    person,
    channel,
    botDm,
    conversation,
    activeChannel,
    receipts,
    playback,
    snapshot,
  } = source;
  const { setViewing, actionsFor, setActionsFor, selected, togglePicked, menuCatalog } =
    messageState;
  const { answered, resolutions, latestMessageId, groupOf, latest } = timeline;
  const { online, composable, startReply } = composer;
  const { rows, arrivals } = timelineRows;
  const { share, retry, reportingActions, openActions, selectMessage, react } = messageActions;
  const liveRoster = host.roster;
  const identityBots = useIdentityBots(liveRoster?.bots);
  const roster = useMemo(
    () => (liveRoster === undefined ? undefined : { ...liveRoster, bots: identityBots ?? [] }),
    [identityBots, liveRoster?.channels, liveRoster?.activityChannels],
  );
  const botName = useBotNames(identityBots);
  const reading = useMemo(() => readingBots(snapshot.messages), [snapshot.messages]);
  const newestMessageId = snapshot.messages.at(-1)?.id;
  const speakerOf = useCallback(
    (id: string, row: { key: string; first: boolean; last: boolean }): Speaker => ({
      name: botName(id),
      bot: roster?.bots.find((entry) => entry.slug === id),
      group: groupOf.get(row.key) ?? row.key,
      first: row.first,
      last: row.last,
    }),
    [roster, botName, groupOf],
  );
  const personFallback = person?.name;
  const people = channel?.humanMembers;
  const personSpeaker = useCallback(
    (
      message: ConversationMessage,
      row: { key: string; first: boolean; last: boolean },
    ): Speaker | undefined => {
      if (message.person === undefined) return undefined;
      const { humanId } = message.person;
      const member = people?.find((entry) => entry.humanId === humanId);
      return {
        name: member?.displayName || message.person.name || personFallback || t.reply.member,
        bot: undefined,
        human: {
          humanId,
          ...(member?.avatarVersion === undefined ? {} : { avatarVersion: member.avatarVersion }),
        },
        group: groupOf.get(row.key) ?? row.key,
        first: row.first,
        last: row.last,
      };
    },
    [people, personFallback, groupOf, t],
  );

  const { switchMessages, hasSessionLinks } = useMemo(() => {
    const seen = new Set<string>();
    const switchMessages = new Set<string>();
    let hasSessionLinks = false;
    for (const { id, turnModelSwitch, sessionLinks } of snapshot.messages) {
      hasSessionLinks ||= (sessionLinks?.length ?? 0) > 0;
      if (turnModelSwitch === undefined) continue;
      const turn = JSON.stringify([turnModelSwitch.sessionId, turnModelSwitch.turn]);
      if (seen.has(turn)) continue;
      seen.add(turn);
      switchMessages.add(id);
    }
    return { switchMessages, hasSessionLinks };
  }, [snapshot.messages]);
  const nativeRows = nativeChatRecycler;
  const nativeRow = useCallback(
    (row: Row) =>
      row.kind === 'draft' ||
      (row.kind === 'message' &&
        (switchMessages.has(row.message.id) || row.message.sessionLinks !== undefined))
        ? undefined
        : nativeTextRow(row, {
            dm,
            selecting: selected !== undefined,
            latest: newestMessageId,
            reading,
            speaker:
              dm || row.kind !== 'message'
                ? undefined
                : row.message.bot !== undefined
                  ? { name: botName(row.message.bot) }
                  : row.message.person !== undefined
                    ? { name: personSpeaker(row.message, row)?.name ?? '' }
                    : undefined,
          }),
    [dm, selected, newestMessageId, reading, botName, personSpeaker, switchMessages],
  );
  const speakerRow = useCallback(
    (row: Row): SpeakerRowSlot | undefined => {
      if (dm) return undefined;
      const group = groupOf.get(row.key) ?? row.key;
      if (row.kind === 'draft')
        return { key: row.key, group, first: true, name: true, bottom: space.x2 };
      if (
        row.kind !== 'message' ||
        (row.message.bot === undefined && row.message.person === undefined)
      )
        return undefined;
      const message = row.message;
      if (
        message.activity !== undefined ||
        message.sessionFailure !== undefined ||
        (message.card !== undefined && REQUEST_CARDS.has(message.card.kind))
      )
        return undefined;
      return {
        key: row.key,
        group,
        first: row.first,
        name: row.first,
        bottom:
          (message.reactions?.length ?? 0) > 0 ? BADGE_OVERLAP + space.x2 : row.last ? space.x2 : 0,
      };
    },
    [dm, groupOf],
  );
  const speakerAvatar = useCallback(
    (group: string) => {
      const row = rows.find((entry) => (groupOf.get(entry.key) ?? entry.key) === group);
      const human =
        row?.kind === 'message'
          ? personSpeaker(row.message, { key: group, first: true, last: true })
          : undefined;
      if (human !== undefined) return <SpeakerAvatar speaker={human} />;
      const slug =
        row?.kind === 'message'
          ? row.message.bot
          : row?.kind === 'draft'
            ? row.draft.botSlug
            : undefined;
      return slug === undefined ? null : (
        <SpeakerAvatar speaker={speakerOf(slug, { key: group, first: true, last: true })} />
      );
    },
    [rows, groupOf, speakerOf, personSpeaker],
  );
  const nativeStyle = useMemo(
    () =>
      nativeTextStyle(
        {
          accent: theme.color.accent,
          surface: theme.color.surface,
          onAccent: theme.color.onAccent,
          fg: theme.color.fg,
          muted: theme.color.muted,
        },
        theme.type,
        theme.fontScale,
        nativeMarkdownStyle(theme),
        nativeTouchStyle(
          {
            pressHuman: pressTint(theme.color.onAccent),
            pressBot: pressTint(theme.color.fg),
            hintFill: theme.layer.raised.fill,
            hintInk: theme.color.muted,
          },
          theme.type.meta.line,
        ),
      ),
    [theme],
  );
  const nativeSwipe = composable && selected === undefined;
  const onNativeRow = useCallback(
    (row: Row, event: NativeRowAction) => {
      if (row.kind !== 'message') return;
      const message = row.message;
      if (event.action === 'press' && event.anchor !== undefined)
        openActions(message, event.anchor, {
          first: row.first,
          last: row.last,
          avatar: !dm && row.last && message.bot !== undefined,
          compact: false,
        });
      else if (event.action === 'hold') {
        haptic('menu');
        selectMessage(message);
      } else if (event.action === 'arm') haptic('selection');
      else if (event.action === 'reply' && nativeSwipe) startReply(message);
    },
    [openActions, selectMessage, startReply, nativeSwipe, dm],
  );
  const [deliveryFor, setDeliveryFor] = useState<string>();
  const openDelivery = useCallback(
    (message: ConversationMessage) => setDeliveryFor(message.id),
    [],
  );
  const attention = useInbox(inbox, focused && hasSessionLinks);
  const actionItems = attention.status === 'ready' ? attention.sections.action : undefined;
  const sessionLinkNeeds = useMemo(() => {
    if (!hasSessionLinks) return undefined;
    const needs = new Map<string, SessionLinkNeed>();
    for (const bot of liveRoster?.bots ?? []) {
      for (const session of bot.sessions ?? []) {
        if (session.role === 'assignment' && session.state === 'waiting') {
          needs.set(session.id, 'needs-you');
        }
      }
    }
    for (const item of actionItems ?? []) {
      if (item.assignmentSessionId === undefined) continue;
      if (item.kind === 'assignment-waiting-human') {
        needs.set(item.assignmentSessionId, 'waiting-human');
      } else if (item.kind === 'assignment-blocked') {
        needs.set(item.assignmentSessionId, 'blocked');
      }
    }
    return needs.size === 0 ? undefined : needs;
  }, [actionItems, hasSessionLinks, liveRoster?.bots]);
  const openSession = useMemo(() => {
    const hostId = saved?.hostId;
    if (hostId === undefined) return undefined;
    return (link: WireSessionLink, slug: string | undefined) =>
      router.push(sessionRoute({ id: link.sessionId, hostId, slug, title: link.title }));
  }, [router, saved?.hostId]);
  const openInbox = (target: { botSlug: string; missing: boolean }) => {
    const messageId = deliveryFor;
    setDeliveryFor(undefined);
    if (!saved || messageId === undefined) return;
    router.push({
      pathname: '/bot/[slug]/inbox',
      params: {
        slug: target.botSlug,
        hostId: saved.hostId,
        messageId,
        missing: target.missing ? '1' : '0',
      },
    });
  };

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'draft')
        return conversation === undefined ? null : (
          <PlaybackBubble
            playback={playback}
            focused={focused}
            queueKey={item.key}
            entering={arrivals.has(item.key)}
            speaker={
              dm
                ? undefined
                : speakerOf(item.draft.botSlug, {
                    key: item.key,
                    first: true,
                    last: true,
                  })
            }
          />
        );
      if (item.kind === 'separator') return <TimeSeparator at={item.at} />;
      const wrap = (children: React.ReactNode) => {
        const row = (
          <MessageSelectionRow
            message={item.message}
            selected={selected === undefined ? undefined : selected.includes(item.message.id)}
            onToggle={() => togglePicked(item.message)}
            onOpen={item.message.card === undefined ? undefined : openActions}
          >
            {children}
          </MessageSelectionRow>
        );
        const { turnModelSwitch } = item.message;
        const change = switchMessages.has(item.message.id) ? turnModelSwitch : undefined;
        if (change === undefined) return row;
        return (
          <View>
            <TurnModelSwitchMarker change={change} catalog={menuCatalog} />
            {row}
          </View>
        );
      };

      if (item.message.activity?.kind === 'voice-call')
        return wrap(<CallRecordBubble record={item.message.activity.record} />);
      if (item.message.activity !== undefined)
        return wrap(
          <ActivityRow
            message={item.message}
            activity={item.message.activity}
            roster={roster}
            count={item.activityCount ?? 1}
            dmSlug={slug}
            lifted={Platform.OS === 'web' && item.message.id === actionsFor?.message.id}
            onLongPress={(anchor, label, target) =>
              setActionsFor({
                message: { ...item.message, body: label },
                ...(reportingActions(item.message)
                  ? { actions: reportingActions(item.message)! }
                  : {}),
                anchor,
                group: { first: true, last: true },
                activity:
                  target === undefined
                    ? {}
                    : {
                        label:
                          item.message.activity?.kind === 'memory'
                            ? t.activityRow.openMemory
                            : item.message.activity?.kind === 'bot-create'
                              ? t.activityRow.openBot
                              : t.activityRow.openChat,
                        onOpen: () => {
                          if (target.pathname === '/dm/[slug]') {
                            if (saved)
                              navigateChannel(navigation, {
                                ...target,
                                params: {
                                  ...target.params,
                                  hostId: saved.hostId,
                                },
                              });
                          } else if (target.pathname === '/channel/[id]') {
                            if (saved)
                              navigateChannel(navigation, {
                                ...target,
                                params: {
                                  ...target.params,
                                  hostId: saved.hostId,
                                },
                              });
                          } else
                            router.push({
                              ...target,
                              params: {
                                ...target.params,
                                hostId: saved?.hostId,
                              },
                            });
                        },
                      },
              })
            }
          />,
        );
      const author = item.message.bot ?? slug;
      if (client && activeChannel && item.message.sessionFailure)
        return (
          <SessionFailureCard
            client={client}
            channelId={activeChannel}
            messageId={item.message.id}
            failure={item.message.sessionFailure}
            latest={item.message.id === latestMessageId}
            onReport={
              saved
                ? () =>
                    router.push({
                      pathname: '/message-feedback',
                      params: {
                        hostId: saved.hostId,
                        channelId: activeChannel,
                        messageId: item.message.id,
                        failureTurn: '1',
                      },
                    })
                : undefined
            }
          />
        );
      if (
        client !== undefined &&
        author !== undefined &&
        (item.message.card?.kind === 'tool-approval' ||
          item.message.card?.kind === 'user-question' ||
          item.message.card?.kind === 'grant' ||
          item.message.card?.kind === 'takeover' ||
          item.message.card?.kind === 'private-input')
      )
        return wrap(
          <RequestCard
            client={client}
            inbox={inbox}
            message={item.message}
            card={item.message.card}
            botSlug={author}
            botName={botName(author)}
            resolution={resolutions.get(item.message.id)}
            focused={item.message.id === focus}
            replyInChat={dm}
            answeredHere={answered.has(item.message.id)}
            group={item}
          />,
        );
      return wrap(
        <PlaybackBubble
          playback={playback}
          focused={focused}
          queueKey={item.key}
          entering={arrivals.has(item.key)}
          message={item.message}
          first={item.first}
          last={item.last}
          onInteractionStart={latest.hold}
          onRetry={retry}
          onOpenImage={setViewing}
          onShare={share}
          onLongPress={openActions}
          {...(android ? { onSelect: selectMessage } : {})}
          lifted={Platform.OS === 'web' && item.message.id === actionsFor?.message.id}
          {...(botDm || !online ? {} : { onReact: react })}
          {...(composable && selected === undefined ? { onReply: startReply } : {})}
          {...(selected === undefined ? { onOpenReply: openReply } : {})}
          {...(receipts ? { onOpenDelivery: openDelivery } : {})}
          onOpenSession={selected === undefined ? openSession : undefined}
          sessionLinkNeeds={item.message.sessionLinks === undefined ? undefined : sessionLinkNeeds}
          readers={reading.get(item.message.id)}
          bots={roster?.bots}
          botName={botName}
          speaker={
            dm
              ? undefined
              : item.message.bot !== undefined
                ? speakerOf(item.message.bot, item)
                : personSpeaker(item.message, item)
          }
        />,
      );
    },
    [
      t,
      menuCatalog,
      switchMessages,
      dm,
      playback,
      focused,
      conversation,
      latestMessageId,
      latest.hold,
      client,
      slug,
      inbox,
      resolutions,
      focus,
      answered,
      retry,
      openActions,
      selectMessage,
      reportingActions,
      selected,
      togglePicked,
      theme,
      actionsFor,
      share,
      react,
      online,
      botName,
      speakerOf,
      personSpeaker,
      roster,
      botDm,
      router,
      receipts,
      reading,
      arrivals,
      composable,
      startReply,
      openReply,
      openSession,
      sessionLinkNeeds,
    ],
  );
  return {
    roster,
    botName,
    people,
    nativeRows,
    nativeRow,
    speakerRow,
    speakerAvatar,
    nativeStyle,
    nativeSwipe,
    onNativeRow,
    deliveryFor,
    setDeliveryFor,
    openInbox,
    renderItem,
  };
}
