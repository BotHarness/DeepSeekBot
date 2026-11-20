import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { type ViewInstance } from 'react-native';
import { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';
import { visibleDmActivity } from '../../host/dm-activity';
import {
  collapseRepeatedFailures,
  latestTurnMessageId,
} from '@botharness/host-client/session-failure';
import { shownInChat } from '@botharness/host-client/conversation';
import { useChannelViewport } from './channel-viewport';
import { type ChatListHandle } from '../primitives/chat-list';
import { useArrivals } from './arrivals';
import { chatRows, messageGroups } from './message-groups';
import { createSpeakerRegistry } from './speaker-row';
import type { useConversationSource } from './conversation-source';
import type { useConversationScrollState, Row } from './conversation-focus';

export function useConversationTimeline({
  focus,
  headerOverlap,
  android,
  source,
  scrollState,
}: {
  focus: string | undefined;
  headerOverlap: number;
  android: boolean;
  source: Pick<
    ReturnType<typeof useConversationSource>,
    'dm' | 'hiddenActivity' | 'playback' | 'snapshot' | 'shownDrafts'
  >;
  scrollState: Pick<ReturnType<typeof useConversationScrollState>, 'list' | 'scrollRef'>;
}) {
  const { dm, hiddenActivity, playback, snapshot, shownDrafts } = source;
  const { list, scrollRef } = scrollState;
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());

  const resolutions = useMemo(
    () =>
      new Map(
        snapshot.messages.flatMap((message) =>
          message.resolves === undefined
            ? []
            : [[message.resolves.requestId, message.resolves.resolution] as const],
        ),
      ),
    [snapshot.messages],
  );

  const visible = useMemo(() => {
    const shown = snapshot.messages.filter(shownInChat);
    return collapseRepeatedFailures(
      dm ? visibleDmActivity(shown, hiddenActivity) : shown,
      (message) => ({ bot: message.bot, failure: message.sessionFailure }),
      (message, repeated) => ({
        ...message,
        sessionFailure: { ...message.sessionFailure!, repeated },
      }),
      (message) => message.id === focus,
    );
  }, [snapshot.messages, dm, hiddenActivity, focus]);
  const latestMessageId = latestTurnMessageId(snapshot.messages);
  const chronological = useMemo(
    () =>
      chatRows(
        visible,
        (message) => message.card !== undefined && (!dm || !resolutions.has(message.id)),
      ).map((row) =>
        row.kind === 'message' ? { ...row, key: playback?.rowKey(row.message.id) ?? row.key } : row,
      ),
    [visible, resolutions, dm, playback],
  );
  const [speakers] = useState(createSpeakerRegistry);
  const groups = useMemo(() => messageGroups(chronological), [chronological]);
  const groupOf = useMemo(() => new Map(groups.map((entry) => [entry.key, entry.group])), [groups]);
  useLayoutEffect(() => {
    speakers.setGroups([
      ...groups,
      ...shownDrafts.map((entry) => {
        const key = `draft:${entry.draftId}`;
        return { key, group: key };
      }),
    ]);
  }, [speakers, groups, shownDrafts]);
  const scroll = useScrollOffset(scrollRef);
  const viewport = useAnimatedRef<ViewInstance>();
  const content = useAnimatedRef<ViewInstance>();
  const frame = useAnimatedRef<ViewInstance>();
  const attachList = useCallback(
    (node: ChatListHandle<Row> | null) => {
      list.current = node;
      const scroll = node?.getNativeScrollRef?.();
      scrollRef(scroll === null || scroll === undefined ? null : (scroll as ViewInstance));
      frame(scroll === null || scroll === undefined ? null : (scroll as ViewInstance));
      content(
        scroll !== null && scroll !== undefined && 'getInnerViewRef' in scroll
          ? scroll.getInnerViewRef()
          : null,
      );
    },
    [list, content, frame, scrollRef],
  );
  const latest = useChannelViewport(
    list,
    visible,
    playback?.setFollowing,
    headerOverlap,
    snapshot.status === 'live' && visible.length === 0,
    android ? 0 : chronological[0]?.kind === 'separator' ? 1 : 0,
    android,
  );
  return {
    answered,
    setAnswered,
    resolutions,
    visible,
    latestMessageId,
    chronological,
    speakers,
    groupOf,
    scroll,
    viewport,
    content,
    frame,
    attachList,
    latest,
  };
}

export function useConversationTimelineRows({
  android,
  source,
  timeline,
}: {
  android: boolean;
  source: Pick<ReturnType<typeof useConversationSource>, 'shownDrafts'>;
  timeline: Pick<ReturnType<typeof useConversationTimeline>, 'chronological' | 'latest'>;
}) {
  const { shownDrafts } = source;
  const { chronological, latest } = timeline;
  const rows = useMemo<Row[]>(() => {
    const ordered: Row[] = [
      ...chronological,
      ...shownDrafts.map((entry): Row => ({
        kind: 'draft',
        key: `draft:${entry.draftId}`,
        draft: entry,
      })),
    ];
    return android ? ordered.toReversed() : ordered;
  }, [shownDrafts, chronological, android]);
  const rowKeys = useMemo(
    () => (android ? rows.toReversed() : rows).map((row) => row.key),
    [rows, android],
  );
  const arrivals = useArrivals(rowKeys, latest.ready);
  return { rows, arrivals };
}
