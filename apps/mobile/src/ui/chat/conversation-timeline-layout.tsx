import type { useProfilePaging } from './profile-paging';
import { Platform, type NativeScrollEvent, type NativeSyntheticEvent, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  ChatTimelineLoading,
  ChatTimelineOverlays,
  chatLatestSpacer,
  chatTimelineListLayout,
  type useChatInitialScroll,
} from './chat-timeline-chrome';
import { ChatList } from '../primitives/chat-list';
import type { usePullToCompose } from './pull-to-compose';
import { SwipeOpen } from '../shell/swipe-open';
import { PullToComposeHint } from './pull-to-compose-hint';
import { HumanAvatarClientContext } from '../../host/human-profile';
import { SpeakerAnchor } from './speaker-anchor';
import { SPEAKER_VIEWPORT } from './speaker-span';
import { SpeakerStageContext } from './speaker-row';
import { SendFlightsContext } from './send-fly';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { MarkdownViewportContext } from '../markdown-viewport';
import type { useStrings } from '../strings';
import { Button } from '../primitives/button';
import type { ContextType } from 'react';
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
  initialScroll,
  fadeColor,
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
  initialScroll: ReturnType<typeof useChatInitialScroll>;
  fadeColor: string;
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
  const { key, ...initialScrollProps } = initialScroll;
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
                  key={key}
                  {...initialScrollProps}
                  ref={attachList}
                  renderScrollComponent={latest.renderScrollComponent}
                  CellRendererComponentStyle={cellLayer}
                  {...chatTimelineListLayout({
                    headerOverlap,
                    headerPadding,
                    listSafeArea,
                    nativeSpacer,
                    viewportHeight,
                    composerHeight,
                    ready: latest.ready || rows.length === 0,
                  })}
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
                    [android ? 'ListHeaderComponent' : 'ListFooterComponent']: chatLatestSpacer(
                      latest,
                      nativeSpacer,
                    ),
                  }}
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
            <ChatTimelineLoading
              latest={latest}
              headerPadding={headerPadding}
              composerHeight={composerHeight}
            />
          ) : null}
          <ChatTimelineOverlays
            color={fadeColor}
            headerOverlap={headerOverlap}
            headerPadding={headerPadding}
            nativeSpacer={nativeSpacer}
            latest={latest}
            composerHeight={composerHeight}
          >
            {(composable || stackRoot) && Platform.OS === 'ios' ? (
              <PullToComposeHint
                progress={pull.progress}
                ready={pull.ready}
                bottom={composerHeight + space.x3}
                leaves={stackRoot}
              />
            ) : null}
          </ChatTimelineOverlays>
        </Animated.View>
      </Animated.View>
    </SwipeOpen>
  );
}
