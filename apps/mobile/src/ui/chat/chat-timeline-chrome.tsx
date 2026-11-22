import { useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { Button } from '../primitives/button';
import { ListSkeleton } from '../primitives/list-skeleton';
import { useStrings } from '../strings';
import { edge, edgeFade, island, space } from '../design/tokens';
import {
  KeyboardChatFrame,
  useListBottomSafeArea,
  type KeyboardChatFrameProps,
} from '../primitives/keyboard-frame';
import type { useChannelViewport } from './channel-viewport';
import { ComposerFollower, ComposerPillContext, ComposerSpacer } from './composer-pill';
import { EdgeFade, useChatHeaderHeight } from './header-chrome';
import { JumpToLatest } from './jump-to-latest';
import { LatestAnchor } from './latest-anchor';
import { floatingHeader, glassHeader, useHeaderOverlap, useHeaderPadding } from './native-header';

export function chatStackOptions(backgroundColor: string) {
  const transparent = Platform.OS === 'ios' || floatingHeader;
  return {
    headerShown: Platform.OS !== 'android',
    headerTransparent: transparent,
    headerStyle: transparent ? {} : { backgroundColor },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    ...(glassHeader
      ? { scrollEdgeEffects: { top: 'automatic' as const, bottom: 'hidden' as const } }
      : {}),
  };
}

export function useChatTimelineChrome() {
  const headerOverlap = useHeaderOverlap();
  const nativePadding = useHeaderPadding();
  const inlineHeight = useChatHeaderHeight();
  const [measuredHeight, setMeasuredHeaderHeight] = useState(0);
  const listSafeArea = useListBottomSafeArea();
  const android = Platform.OS === 'android';
  const headerPadding = android ? measuredHeight || inlineHeight : nativePadding;
  const nativeSpacer = !android && LatestAnchor !== undefined;
  return { headerOverlap, headerPadding, nativeSpacer, setMeasuredHeaderHeight, listSafeArea };
}

export function useChatInitialScroll(openLatest: boolean, count: number) {
  const openAtLatest =
    Platform.OS === 'ios' && process.env.EXPO_PUBLIC_IOS_OPEN_AT_LATEST !== '0' && openLatest;
  const [openedAtLatest, setOpenedAtLatest] = useState(false);
  if (!openedAtLatest && openAtLatest && count > 0) setOpenedAtLatest(true);
  return {
    key: openedAtLatest || (openAtLatest && count > 0) ? 'rows' : 'list',
    ...(Platform.OS === 'android'
      ? { initialNumToRender: 6, maxToRenderPerBatch: 6, windowSize: 5 }
      : openAtLatest
        ? { initialScrollIndex: Math.max(0, count - 1), initialNumToRender: 4 }
        : {}),
  };
}

export function chatTimelineListLayout({
  headerOverlap,
  headerPadding,
  listSafeArea,
  nativeSpacer,
  viewportHeight,
  composerHeight,
  ready,
}: {
  headerOverlap: number;
  headerPadding: number;
  listSafeArea: number;
  nativeSpacer: boolean;
  viewportHeight: number;
  composerHeight: number;
  ready: boolean;
}) {
  const android = Platform.OS === 'android';
  return {
    inverted: android,
    removeClippedSubviews: false,
    style: { flex: 1, opacity: ready ? 1 : 0 },
    pointerEvents: ready ? ('auto' as const) : ('none' as const),
    accessibilityElementsHidden: !ready,
    importantForAccessibility: ready ? ('auto' as const) : ('no-hide-descendants' as const),
    contentInsetAdjustmentBehavior: 'automatic' as const,
    contentInset: { bottom: -listSafeArea },
    automaticallyAdjustsScrollIndicatorInsets: true,
    scrollToOverflowEnabled: true,
    contentContainerStyle: {
      minHeight: Math.max(0, viewportHeight - headerOverlap + (android ? edge.hairline : 0)),
      justifyContent: android ? ('flex-start' as const) : ('flex-end' as const),
      paddingTop: android ? composerHeight + edgeFade.bottom : space.x3 + headerPadding,
      paddingBottom: android
        ? space.x3 + headerPadding
        : nativeSpacer
          ? 0
          : composerHeight + edgeFade.bottom,
    },
    keyboardDismissMode: Platform.OS === 'ios' ? ('interactive' as const) : ('on-drag' as const),
    keyboardShouldPersistTaps: 'never' as const,
  };
}

type ChatViewport = ReturnType<typeof useChannelViewport>;

export function ChatTimelineFrame({
  latest,
  nativeSpacer,
  composer,
  ...props
}: Omit<KeyboardChatFrameProps, 'onComposerLayout'> & {
  latest: Pick<ChatViewport, 'onComposerLayout' | 'pill'>;
  nativeSpacer: boolean;
}) {
  return (
    <KeyboardChatFrame
      {...props}
      onComposerLayout={latest.onComposerLayout}
      composer={
        <ComposerPillContext.Provider value={nativeSpacer ? latest.pill : undefined}>
          {composer}
        </ComposerPillContext.Provider>
      }
    />
  );
}

export function chatLatestSpacer(
  latest: Pick<ChatViewport, 'pill' | 'ready' | 'away' | 'reducedMotion'>,
  nativeSpacer: boolean,
) {
  if (LatestAnchor === undefined) return undefined;
  const anchor = (
    <LatestAnchor
      following={latest.ready && !latest.away}
      animated={!latest.reducedMotion}
      style={{ height: 0 }}
    />
  );
  return nativeSpacer ? (
    <ComposerSpacer pill={latest.pill} extra={edgeFade.bottom}>
      {anchor}
    </ComposerSpacer>
  ) : (
    anchor
  );
}

export function ChatTimelineLoading({
  latest,
  headerPadding,
  composerHeight,
}: {
  latest: Pick<ChatViewport, 'canRetry' | 'retry'>;
  headerPadding: number;
  composerHeight: number;
}) {
  const t = useStrings();
  return (
    <View
      pointerEvents={latest.canRetry ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        top: Platform.OS === 'android' ? 0 : headerPadding,
        bottom: composerHeight + edgeFade.bottom,
        left: 0,
        right: 0,
        justifyContent: 'flex-end',
      }}
    >
      <ListSkeleton layout="messages" />
      {latest.canRetry ? (
        <Button
          label={t.retry}
          variant="text"
          testID="history-loading-retry"
          onPress={latest.retry}
        />
      ) : null}
    </View>
  );
}

export function ChatTimelineOverlays({
  color,
  headerOverlap,
  headerPadding,
  nativeSpacer,
  latest,
  composerHeight,
  children,
}: {
  color: string;
  headerOverlap: number;
  headerPadding: number;
  nativeSpacer: boolean;
  latest: Pick<ChatViewport, 'pill' | 'away' | 'unseen' | 'jumpToLatest'>;
  composerHeight: number;
  children?: ReactNode;
}) {
  const android = Platform.OS === 'android';
  const topFade = android ? 0 : floatingHeader ? headerPadding : headerOverlap;
  const cover = Math.max(0, composerHeight - space.x3 - space.x2);
  const bottomFade = (
    <EdgeFade
      edge="bottom"
      height={cover + edgeFade.bottom}
      cover={cover}
      solid={android ? 0 : cover}
      color={color}
      {...(android ? { shape: island.fade } : {})}
    />
  );
  return (
    <>
      {topFade > 0 ? (
        <EdgeFade
          edge="top"
          height={topFade + (glassHeader ? space.x6 : edgeFade.reach)}
          cover={glassHeader ? 0 : topFade}
          color={color}
        />
      ) : null}
      {nativeSpacer ? (
        <ComposerFollower pill={latest.pill} measured={composerHeight}>
          {bottomFade}
        </ComposerFollower>
      ) : (
        bottomFade
      )}
      {children}
      {latest.away ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            bottom: composerHeight + space.x2,
            left: 0,
            right: space.x4,
            alignItems: 'flex-end',
          }}
        >
          <JumpToLatest unseen={latest.unseen} onPress={latest.jumpToLatest} />
        </View>
      ) : null}
    </>
  );
}
