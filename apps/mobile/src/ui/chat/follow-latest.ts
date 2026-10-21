import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';

import type { ConversationMessage } from '../../host/conversation';

export const LATEST_SLOP = 40;
export const SETTLE_FRAMES = 12;

export type ListMetrics = { content: number; layout: number; offset: number };

export function atLatest(distance: number): boolean {
  return distance <= LATEST_SLOP;
}

export function distanceFromLatest(metrics: ListMetrics): number {
  return metrics.content - metrics.layout - metrics.offset;
}

export function latestOffset(metrics: Omit<ListMetrics, 'offset'>, start: number): number {
  return Math.max(0 - start, metrics.content - metrics.layout);
}

export function anchorStep(
  anchor: number,
  offset: number,
  latest: number,
  following: boolean,
): number {
  'worklet';
  return following ? Math.min(latest, Math.max(anchor, offset)) : latest;
}

export function unseenSince(
  messages: readonly ConversationMessage[],
  anchor: string | undefined,
): number {
  const start =
    anchor === undefined ? 0 : messages.findLastIndex((message) => message.id === anchor) + 1;
  if (anchor !== undefined && start === 0) return 0;
  let count = 0;
  for (let index = start; index < messages.length; index += 1)
    if (messages[index]!.author !== 'human') count += 1;
  return count;
}

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

const KEEP_VISIBLE = { minIndexForVisible: 0 };

export function useFollowLatest<Row>(
  list: RefObject<FlatList<Row> | null>,
  messages: readonly ConversationMessage[],
  onFollowingChange?: (following: boolean) => void,
  start = 0,
  empty = false,
  onLatestChange?: (offset: number) => void,
) {
  const [following, setFollowing] = useState(true);
  const [away, setAway] = useState(false);
  const [anchor, setAnchor] = useState<string | undefined>();
  const [ready, setReady] = useState(false);
  if (!ready && empty) setReady(true);
  const followingNow = useRef(true);
  const dragging = useRef(false);
  const latestId = useRef<string | undefined>(undefined);
  latestId.current = messages.at(-1)?.id;
  const hasRows = useRef(false);
  hasRows.current = messages.length > 0;
  const startInset = useRef(start);
  startInset.current = start;
  const latestChange = useRef(onLatestChange);
  latestChange.current = onLatestChange;
  const metrics = useRef<ListMetrics>({ content: 0, layout: 0, offset: 0 });
  const frame = useRef<number | undefined>(undefined);
  const sizes = useRef(0);
  const settled = useRef(false);
  const attempts = useRef(0);
  useLayoutEffect(() => {
    if (!followingNow.current) onFollowingChange?.(false);
  }, [onFollowingChange]);
  useLayoutEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
    },
    [],
  );

  const measureEvent = useCallback((event: ScrollEvent): number => {
    const native = event.nativeEvent;
    metrics.current = {
      content: native.contentSize?.height ?? metrics.current.content,
      layout: native.layoutMeasurement?.height ?? metrics.current.layout,
      offset: native.contentOffset.y,
    };
    return distanceFromLatest(metrics.current);
  }, []);

  const scrollToLatest = useCallback(
    (animated: boolean) => {
      const offset = latestOffset(metrics.current, startInset.current);
      list.current?.scrollToOffset({ offset, animated });
    },
    [list],
  );

  const hold = useCallback(() => {
    if (!followingNow.current) return;
    followingNow.current = false;
    onFollowingChange?.(false);
    setAway(true);
    setAnchor(latestId.current);
    setFollowing(false);
  }, [onFollowingChange]);

  const follow = useCallback(() => {
    if (!followingNow.current) onFollowingChange?.(true);
    followingNow.current = true;
    setFollowing(true);
    setAway(false);
  }, [onFollowingChange]);

  const confirm = useCallback((version: number) => {
    requestAnimationFrame(() => {
      if (settled.current) return;
      attempts.current += 1;
      if ((version === sizes.current && hasRows.current) || attempts.current >= SETTLE_FRAMES) {
        settled.current = true;
        setReady(true);
      }
    });
  }, []);

  const pin = useCallback(() => {
    latestChange.current?.(latestOffset(metrics.current, startInset.current));
    if (frame.current !== undefined) return;
    if (!followingNow.current && settled.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      if (followingNow.current && metrics.current.layout > 0) scrollToLatest(false);
      if (!settled.current) confirm(sizes.current);
    });
  }, [scrollToLatest, confirm]);

  const settle = useCallback(
    (distance: number) => {
      if (!atLatest(distance)) return;
      if (distance > 0) scrollToLatest(true);
      follow();
    },
    [scrollToLatest, follow],
  );

  const onScroll = useCallback(
    (event: ScrollEvent) => {
      measureEvent(event);
    },
    [measureEvent],
  );

  const onScrollBeginDrag = useCallback(() => {
    dragging.current = true;
    hold();
  }, [hold]);

  const onScrollEndDrag = useCallback(
    (event: ScrollEvent) => {
      dragging.current = false;
      const distance = measureEvent(event);
      if ((event.nativeEvent.velocity?.y ?? 0) === 0) settle(distance);
    },
    [measureEvent, settle],
  );

  const onMomentumScrollEnd = useCallback(
    (event: ScrollEvent) => {
      const distance = measureEvent(event);
      if (dragging.current) return;
      settle(distance);
    },
    [measureEvent, settle],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      metrics.current = { ...metrics.current, content: height };
      sizes.current += 1;
      pin();
    },
    [pin],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      metrics.current = { ...metrics.current, layout: event.nativeEvent.layout.height };
      pin();
    },
    [pin],
  );

  const jumpToLatest = useCallback(() => {
    follow();
    setReady(true);
    scrollToLatest(true);
  }, [scrollToLatest, follow]);

  return {
    away,
    ready,
    unseen: following ? 0 : unseenSince(messages, anchor),
    hold,
    jumpToLatest,
    listProps: {
      onScroll,
      onScrollToTop: hold,
      onScrollBeginDrag,
      onScrollEndDrag,
      onMomentumScrollEnd,
      onContentSizeChange,
      onLayout,
      maintainVisibleContentPosition: following ? undefined : KEEP_VISIBLE,
    },
  };
}
