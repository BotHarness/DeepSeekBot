import type { useProfilePaging } from './profile-paging';
import { Platform, type NativeScrollEvent, type NativeSyntheticEvent, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ComposerFollower, ComposerSpacer } from './composer-pill';
import { EdgeFade } from './header-chrome';
import { glassHeader } from './native-header';
import { ChatList } from '../primitives/chat-list';
import type { usePullToCompose } from './pull-to-compose';
import { SwipeOpen } from '../shell/swipe-open';
import { PullToComposeHint } from './pull-to-compose-hint';
import { JumpToLatest } from './jump-to-latest';
import { HumanAvatarClientContext } from '../../host/human-profile';
import { LatestAnchor } from './latest-anchor';
import { SpeakerAnchor } from './speaker-anchor';
import { SPEAKER_VIEWPORT } from './speaker-span';
import { SpeakerStageContext } from './speaker-row';
import { SendFlightsContext } from './send-fly';
import { edge, edgeFade, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { MarkdownViewportContext } from '../markdown-viewport';
import type { useStrings } from '../strings';
import { ListSkeleton } from '../primitives/list-skeleton';
import { Button } from '../primitives/button';
import type { ContextType, ReactElement } from 'react';
import type { useConversationSource } from './conversation-source';
import type { useConversationScrollState, useConversationFocusJump } from './conversation-focus';
import type { useConversationTimeline, useConversationTimelineRows } from './conversation-timeline';
import type { useConversationComposer } from './conversation-composition';
import type { useConversationRowRendering } from './conversation-rows';
import type { useConversationProfile } from './conversation-header';

const cellLayer = ({ index }: { index: number }) => ({ zIndex: -index });

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

export function renderConversationTimeline({
  t,
  paging,
  focus,
  focusRequest,
  headerOverlap,
  android,
  nativeSpacer,
  headerPadding,
  listSafeArea,
  stackRoot,
  pull,
  markdownViewport,
  ios,
  openAtLatest,
  openedAtLatest,
  listTop,
  topFade,
  fadeColor,
  bottomFade,
  source,
  scrollState,
  timeline,
  composer,
  timelineRows,
  focusJump,
  rowRendering,
  profile,
}: {
  t: ReturnType<typeof useStrings>;
  paging: ReturnType<typeof useProfilePaging>;
  focus: string | undefined;
  focusRequest: string | undefined;
  headerOverlap: number;
  android: boolean;
  nativeSpacer: boolean;
  headerPadding: number;
  listSafeArea: number;
  stackRoot: boolean;
  pull: ReturnType<typeof usePullToCompose>;
  markdownViewport: ContextType<typeof MarkdownViewportContext>;
  ios: boolean;
  openAtLatest: boolean;
  openedAtLatest: boolean;
  listTop: number;
  topFade: number;
  fadeColor: string;
  bottomFade: ReactElement;
  source: Pick<
    ReturnType<typeof useConversationSource>,
    'client' | 'dm' | 'person' | 'conversation' | 'snapshot'
  >;
  scrollState: ReturnType<typeof useConversationScrollState>;
  timeline: Pick<ReturnType<typeof useConversationTimeline>, 'viewport' | 'attachList' | 'latest'>;
  composer: ReturnType<typeof useConversationComposer>;
  timelineRows: Pick<ReturnType<typeof useConversationTimelineRows>, 'rows'>;
  focusJump: ReturnType<typeof useConversationFocusJump>;
  rowRendering: ReturnType<typeof useConversationRowRendering>;
  profile: Pick<
    ReturnType<typeof useConversationProfile>,
    'missing' | 'profileTravel' | 'canSwipeProfile' | 'swipeProfile'
  >;
}) {
  const { client, dm, person, conversation, snapshot } = source;
  const {
    list,
    jumped,
    focusCancelled,
    focusNeedsLayout,
    focusHasLiveLayout,
    focusEstimate,
    focusAttempt,
    setAnchoredFocus,
    positioningFocus,
    onFocusViewabilityChange,
    focusIntent,
  } = scrollState;
  const { viewport, attachList, latest } = timeline;
  const { composerHeight, viewportHeight, viewportLayout, stage, flights, composable } = composer;
  const { rows } = timelineRows;
  const { jump } = focusJump;
  const {
    nativeRows,
    nativeRow,
    speakerRow,
    speakerAvatar,
    nativeStyle,
    nativeSwipe,
    onNativeRow,
    renderItem,
  } = rowRendering;
  const { missing, profileTravel, canSwipeProfile, swipeProfile } = profile;
  return (
    <SwipeOpen
      testID="chat-profile-swipe"
      enabled={!android && paging === undefined && canSwipeProfile}
      travel={profileTravel}
      onOpen={swipeProfile}
    >
      <Animated.View style={{ flex: 1 }} onLayout={latest.onViewportLayout}>
        <MarkdownViewportContext.Provider value={markdownViewport}>
          <SpeakerStageContext.Provider value={dm ? undefined : stage}>
            <HumanAvatarClientContext.Provider value={client}>
              <SendFlightsContext.Provider value={flights}>
                <ChatList
                  key={openedAtLatest || (openAtLatest && rows.length > 0) ? 'rows' : 'list'}
                  inverted={android}
                  {...(android
                    ? {
                        initialNumToRender: 6,
                        maxToRenderPerBatch: 6,
                        windowSize: 5,
                      }
                    : openAtLatest
                      ? {
                          initialScrollIndex: Math.max(0, rows.length - 1),
                          initialNumToRender: 4,
                        }
                      : {})}
                  ref={attachList}
                  renderScrollComponent={latest.renderScrollComponent}
                  removeClippedSubviews={false}
                  CellRendererComponentStyle={cellLayer}
                  style={{
                    flex: 1,
                    opacity: latest.ready || rows.length === 0 ? 1 : 0,
                  }}
                  pointerEvents={!latest.ready && rows.length > 0 ? 'none' : 'auto'}
                  accessibilityElementsHidden={!latest.ready && rows.length > 0}
                  importantForAccessibility={
                    !latest.ready && rows.length > 0 ? 'no-hide-descendants' : 'auto'
                  }
                  contentInsetAdjustmentBehavior="automatic"
                  contentInset={{ bottom: -listSafeArea }}
                  automaticallyAdjustsScrollIndicatorInsets
                  scrollToOverflowEnabled
                  contentContainerStyle={{
                    minHeight: Math.max(
                      0,
                      viewportHeight -
                        headerOverlap +
                        (Platform.OS === 'android' ? edge.hairline : 0),
                    ),
                    justifyContent: android ? 'flex-start' : 'flex-end',
                    paddingTop: android ? composerHeight + edgeFade.bottom : space.x3 + listTop,
                    paddingBottom: android
                      ? space.x3 + headerPadding
                      : nativeSpacer
                        ? 0
                        : composerHeight + edgeFade.bottom,
                  }}
                  data={rows}
                  keyExtractor={(row) => row.key}
                  {...((nativeRows
                    ? {
                        nativeRow,
                        nativeStyle,
                        nativeSwipe,
                        onNativeRow,
                        speakerRow,
                        speakerAvatar,
                      }
                    : {}) as object)}
                  renderItem={renderItem}
                  onViewableItemsChanged={onFocusViewabilityChange}
                  onScrollToIndexFailed={(info) => {
                    const attempt = focusAttempt.current;
                    if (
                      focusCancelled.current ||
                      attempt === undefined ||
                      attempt.index !== info.index ||
                      attempt.message !== focusIntent.current.message ||
                      attempt.request !== focusIntent.current.request
                    )
                      return;
                    focusNeedsLayout.current = true;
                    jumped.current = undefined;
                    focusAttempt.current = undefined;
                    const estimate = `${info.index}:${info.highestMeasuredFrameIndex}:${info.averageItemLength}`;
                    if (focusEstimate.current === estimate) return;
                    focusEstimate.current = estimate;
                    list.current?.scrollToOffset({
                      offset: info.averageItemLength * info.index,
                      animated: false,
                    });
                  }}
                  {...(latest.ready && latest.browsed && !snapshot.olderError
                    ? {
                        [android ? 'onEndReached' : 'onStartReached']: () =>
                          void conversation?.loadOlder(),
                      }
                    : {})}
                  onStartReachedThreshold={0.5}
                  onEndReachedThreshold={0.5}
                  {...latest.listProps}
                  maintainVisibleContentPosition={
                    positioningFocus ? undefined : latest.listProps.maintainVisibleContentPosition
                  }
                  onScrollBeginDrag={(event: ScrollEvent) => {
                    focusCancelled.current = true;
                    focusAttempt.current = undefined;
                    if (android) setAnchoredFocus({ message: focus, request: focusRequest });
                    pull.onScrollBeginDrag(event);
                    latest.listProps.onScrollBeginDrag();
                  }}
                  onScroll={(event: ScrollEvent) => {
                    latest.listProps.onScroll(event);
                    pull.onScroll(event);
                  }}
                  onScrollEndDrag={(event: ScrollEvent) => {
                    latest.listProps.onScrollEndDrag(event);
                    pull.onScrollEndDrag(event);
                  }}
                  onContentSizeChange={(width: number, height: number) => {
                    latest.listProps.onContentSizeChange(width, height);
                    focusNeedsLayout.current = false;
                    if (positioningFocus && !focusCancelled.current) {
                      focusHasLiveLayout.current =
                        snapshot.status === 'live' && !snapshot.fromCache;
                      jumped.current = undefined;
                    }
                    jump();
                  }}
                  scrollEventThrottle={
                    (!dm && SpeakerAnchor === undefined) ||
                    (Platform.OS === 'android' && !latest.ready)
                      ? 16
                      : 32
                  }
                  {...{
                    [android ? 'ListHeaderComponent' : 'ListFooterComponent']:
                      LatestAnchor === undefined ? undefined : nativeSpacer ? (
                        <ComposerSpacer pill={latest.pill} extra={edgeFade.bottom}>
                          <LatestAnchor
                            following={latest.ready && !latest.away}
                            animated={!latest.reducedMotion}
                            style={{ height: 0 }}
                          />
                        </ComposerSpacer>
                      ) : (
                        <LatestAnchor
                          following={latest.ready && !latest.away}
                          animated={!latest.reducedMotion}
                          style={{ height: 0 }}
                        />
                      ),
                  }}
                  keyboardDismissMode={ios ? 'interactive' : 'on-drag'}
                  keyboardShouldPersistTaps="never"
                  {...{
                    [android ? 'ListFooterComponent' : 'ListHeaderComponent']:
                      snapshot.loadingOlder || snapshot.olderError ? (
                        <View style={{ padding: space.x4, gap: space.x2 }}>
                          <Text variant="meta" tone="muted" accessibilityLiveRegion="polite">
                            {snapshot.loadingOlder ? t.olderLoading : t.olderLoadFailed}
                          </Text>
                          <Button
                            label={t.retry}
                            variant="text"
                            busy={snapshot.loadingOlder}
                            testID="history-retry"
                            onPress={() => void conversation?.loadOlder()}
                          />
                        </View>
                      ) : !snapshot.hasOlder && snapshot.status === 'live' ? (
                        <Text
                          variant="meta"
                          tone="muted"
                          style={{ textAlign: 'center', padding: space.x5 }}
                        >
                          {dm || person !== undefined ? t.beginning : t.beginningChannel}
                        </Text>
                      ) : undefined,
                  }}
                />
              </SendFlightsContext.Provider>
            </HumanAvatarClientContext.Provider>
          </SpeakerStageContext.Provider>
        </MarkdownViewportContext.Provider>
        <Animated.View
          ref={viewport}
          nativeID={SPEAKER_VIEWPORT}
          collapsable={false}
          pointerEvents="box-none"
          style={[
            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
            latest.overlayStyle,
          ]}
          onLayout={() => {
            viewportLayout.value += 1;
          }}
        >
          {!missing &&
          ((!latest.ready && rows.length > 0) ||
            (snapshot.status === 'opening' && rows.length === 0)) ? (
            <View
              pointerEvents={latest.canRetry ? 'auto' : 'none'}
              style={{
                position: 'absolute',
                top: listTop,
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
          ) : null}
          {topFade > 0 ? (
            <EdgeFade
              edge="top"
              height={topFade + (glassHeader ? space.x6 : edgeFade.reach)}
              cover={glassHeader ? 0 : topFade}
              color={fadeColor}
            />
          ) : null}
          {nativeSpacer ? (
            <ComposerFollower pill={latest.pill} measured={composerHeight}>
              {bottomFade}
            </ComposerFollower>
          ) : (
            bottomFade
          )}
          {(composable || stackRoot) && Platform.OS === 'ios' ? (
            <PullToComposeHint
              progress={pull.progress}
              ready={pull.ready}
              bottom={composerHeight + space.x3}
              leaves={stackRoot}
            />
          ) : null}
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
        </Animated.View>
      </Animated.View>
    </SwipeOpen>
  );
}
