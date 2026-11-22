import type { useProfilePaging } from './profile-paging';
import { NativePageHeader } from '../primitives/native-page-navigation';
import { SelectionBar, SelectionIslands, SelectionScreenshot } from './message-selection-ui';
import { selectionText } from './message-selection';
import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import type { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EndSheet } from '../primitives/end-sheet';
import { BotProfileScreen } from './bot-profile-screen';
import { GroupProfileScreen } from './group-profile-screen';
import { ChannelDetailsScreen } from './channel-details-screen';
import { ProfileVisibility, RevealProfileConversation } from './profile-visibility';
import { backgroundImageUri } from '../../host/native-chat-background';
import { ChatBackground } from './chat-background';
import { MAX_PICKED, fromClipboardImage } from '../../host/pick-files';
import { ConversationTopBar } from './conversation-top-bar';
import { ChatBackdrop } from './chat-backdrop';
import { Composer } from './composer';
import { ComposerPillContext } from './composer-pill';
import { GroupUnavailable } from './group-unavailable';
import { DraftSaveNotice } from './draft-save-notice';
import { ClipboardImageOffer } from './clipboard-image';
import { EdgeFade } from './header-chrome';
import { humanInitial } from '../shell/human-avatar-initial';
import { floatingHeader, glassHeader, headerIslands } from './native-header';
import type { usePullToCompose } from './pull-to-compose';
import { ProfileSwipePreview } from './profile-swipe-preview';
import { ReplyBar } from './reply-bar';
import { ImageViewer } from './image-viewer';
import { DeliverySheet } from './delivery-sheet';
import { GenuiInteraction, GenuiViewHost } from './genui-view-client';
import { ChatOffline } from './chat-offline';
import { ReplyPeopleContext } from './reply-author';
import { MessageActions } from './message-actions';
import { MessageSourcePage } from './message-source-page';
import { MentionSuggestions } from './mention-suggestions';
import { SkillSuggestions } from './skill-suggestions';
import { replyable } from './message-bubble';
import { copyMessage, shareText } from './message-menu';
import type { useDesignTheme } from '../design/theme';
import { edgeFade, island, space } from '../design/tokens';
import { Text } from '../primitives/text';
import type { MarkdownViewportContext } from '../markdown-viewport';
import { KeyboardChatFrame } from '../primitives/keyboard-frame';
import type { useStrings } from '../strings';
import type { ContextType, Dispatch, SetStateAction } from 'react';
import { renderConversationTimeline } from './conversation-timeline-layout';
import type { useConversationSource } from './conversation-source';
import type {
  useConversationDraft,
  useConversationComposer,
  useConversationDraftActions,
} from './conversation-composition';
import type {
  useConversationMessageState,
  useConversationMessageActions,
} from './conversation-message-actions';
import type { useConversationScrollState, useConversationFocusJump } from './conversation-focus';
import type { useConversationTimeline, useConversationTimelineRows } from './conversation-timeline';
import type { useConversationRowRendering } from './conversation-rows';
import type {
  useConversationProfile,
  conversationHeader,
  conversationNotice,
} from './conversation-header';
import type { ConversationPresentation } from './conversation-screen';
import { RequestCard } from './conversation-request-card';

export function renderConversation({
  focused,
  presentation,
  t,
  theme,
  paging,
  focus,
  focusRequest,
  headerOverlap,
  setMeasuredHeaderHeight,
  insets,
  android,
  nativeSpacer,
  headerPadding,
  profileOpen,
  setProfileOpen,
  profileVisited,
  profileOpening,
  setProfileOpening,
  prepareProfile,
  windowWidth,
  listSafeArea,
  stackRoot,
  leave,
  pull,
  markdownViewport,
  screenRef,
  ios,
  openAtLatest,
  openedAtLatest,
  source,
  draftState,
  messageState,
  scrollState,
  timeline,
  composer,
  timelineRows,
  focusJump,
  draftActions,
  messageActions,
  rowRendering,
  profile,
  header,
  notice,
}: {
  focused: boolean;
  presentation: ConversationPresentation | undefined;
  t: ReturnType<typeof useStrings>;
  theme: ReturnType<typeof useDesignTheme>;
  paging: ReturnType<typeof useProfilePaging>;
  focus: string | undefined;
  focusRequest: string | undefined;
  headerOverlap: number;
  setMeasuredHeaderHeight: Dispatch<SetStateAction<number>>;
  insets: ReturnType<typeof useSafeAreaInsets>;
  android: boolean;
  nativeSpacer: boolean;
  headerPadding: number;
  profileOpen: boolean;
  setProfileOpen: Dispatch<SetStateAction<boolean>>;
  profileVisited: boolean;
  profileOpening: boolean;
  setProfileOpening: Dispatch<SetStateAction<boolean>>;
  prepareProfile: () => void;
  windowWidth: number;
  listSafeArea: number;
  stackRoot: boolean;
  leave: () => void;
  pull: ReturnType<typeof usePullToCompose>;
  markdownViewport: ContextType<typeof MarkdownViewportContext>;
  screenRef: (node: unknown) => void;
  ios: boolean;
  openAtLatest: boolean;
  openedAtLatest: boolean;
  source: ReturnType<typeof useConversationSource>;
  draftState: ReturnType<typeof useConversationDraft>;
  messageState: ReturnType<typeof useConversationMessageState>;
  scrollState: ReturnType<typeof useConversationScrollState>;
  timeline: ReturnType<typeof useConversationTimeline>;
  composer: ReturnType<typeof useConversationComposer>;
  timelineRows: Pick<ReturnType<typeof useConversationTimelineRows>, 'rows'>;
  focusJump: ReturnType<typeof useConversationFocusJump>;
  draftActions: ReturnType<typeof useConversationDraftActions>;
  messageActions: Pick<
    ReturnType<typeof useConversationMessageActions>,
    'share' | 'reportingActions' | 'react'
  >;
  rowRendering: ReturnType<typeof useConversationRowRendering>;
  profile: ReturnType<typeof useConversationProfile>;
  header: ReturnType<typeof conversationHeader>;
  notice: ReturnType<typeof conversationNotice>;
}) {
  const {
    client,
    inbox,
    saved,
    host,
    dm,
    slug,
    bot,
    person,
    channel,
    botDm,
    channelName,
    conversation,
    activeChannel,
    background,
    snapshot,
  } = source;
  const {
    draft,
    draftPersistence,
    retryingDraft,
    retryDraft,
    caret,
    setCaret,
    selection,
    setSelection,
    files,
    setFiles,
    setAttachError,
    dictation,
  } = draftState;
  const {
    viewing,
    setViewing,
    actionsFor,
    setActionsFor,
    menuCatalog,
    selectionScope,
    sourceMessage,
    selectSource,
    closeSource,
    setPicked,
    selected,
    setReplying,
    replyTarget,
    imageSelection,
    setImageSelection,
  } = messageState;
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
  const { answered, resolutions, visible, viewport, attachList, latest } = timeline;
  const {
    composerHeight,
    viewportHeight,
    viewportLayout,
    stage,
    composerInput,
    genuiInteraction,
    flights,
    typing,
    setTyping,
    clipboard,
    online,
    composable,
    startReply,
  } = composer;
  const { rows } = timelineRows;
  const { jump } = focusJump;
  const { skillChoices, candidates, edit, mention, chooseSkill, send, pick } = draftActions;
  const { share, reportingActions, react } = messageActions;
  const {
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
  } = rowRendering;
  const {
    connectionLabel,
    missing,
    missingGroup,
    backToChats,
    profileTravel,
    canGoBack,
    botDmName,
    profileHref,
    pairHref,
    groupHref,
    canSwipeProfile,
    openProfile,
    swipeProfile,
    headerStatus,
    title,
    canOpenProfile,
    placeCall,
  } = profile;
  const { headerGap, headerActions, nativeHeaderRow, back, titleItem } = header;
  const { noticeView } = notice;
  const listTop = android ? 0 : headerPadding;
  const topFade = android ? 0 : floatingHeader ? headerPadding : headerOverlap;
  const composerCover = Math.max(0, composerHeight - space.x3 - space.x2);
  const fadeColor = background.kind === 'color' ? background.color : theme.color.base;
  const single =
    selected?.length === 1 ? visible.find((message) => message.id === selected[0]) : undefined;
  const pickedTools =
    selected === undefined
      ? undefined
      : {
          count: selected.length,
          onCancel: () => setPicked(undefined),
          onCopy: () => copyMessage(selectionText(selected, visible)),
          onScreenshot: () =>
            setImageSelection({
              scope: selectionScope,
              messages: visible.filter((m) => selected.includes(m.id)),
            }),
          onReply:
            single !== undefined && replyable(single)
              ? () => {
                  setPicked(undefined);
                  startReply(single);
                }
              : undefined,
          onFeedback:
            single !== undefined && single.delivery === 'committed'
              ? () => {
                  setPicked(undefined);
                  reportingActions(single)?.feedback();
                }
              : undefined,
        };
  const bottomFade = (
    <EdgeFade
      edge="bottom"
      height={composerCover + edgeFade.bottom}
      cover={composerCover}
      solid={android ? 0 : composerCover}
      color={fadeColor}
      {...(android ? { shape: island.fade } : {})}
    />
  );
  const replyBar =
    replyTarget === undefined ? undefined : (
      <ReplyBar message={replyTarget} botName={botName} onCancel={() => setReplying(undefined)} />
    );

  return (
    <ReplyPeopleContext.Provider value={people}>
      <ChatOffline value={!online}>
        <GenuiViewHost value={client}>
          <GenuiInteraction value={genuiInteraction}>
            {paging === undefined && presentation === undefined ? (
              <Stack.Screen
                options={{
                  headerShown: !android,
                  headerTransparent: ios || floatingHeader,
                  headerStyle: ios || floatingHeader ? {} : { backgroundColor: theme.color.base },
                  headerShadowVisible: false,
                  headerBackButtonDisplayMode: 'minimal',
                  ...(glassHeader
                    ? {
                        scrollEdgeEffects: {
                          top: 'automatic' as const,
                          bottom: 'hidden' as const,
                        },
                      }
                    : {}),
                  ...(ios
                    ? {
                        title: '',
                        headerTitle: glassHeader ? () => nativeHeaderRow : '',
                        headerBackVisible: canGoBack && !headerIslands && !glassHeader,
                        unstable_headerRightItems: () =>
                          !canOpenProfile || glassHeader
                            ? []
                            : [
                                {
                                  type: 'button' as const,
                                  label: t.openProfile,
                                  identifier: 'chat-profile-button',
                                  icon: { type: 'sfSymbol' as const, name: 'ellipsis' as const },
                                  sharesBackground: placeCall !== undefined,
                                  onPress: openProfile,
                                },
                                ...(placeCall === undefined
                                  ? []
                                  : [
                                      {
                                        type: 'button' as const,
                                        label: t.call.button,
                                        identifier: 'chat-call-button',
                                        icon: { type: 'sfSymbol' as const, name: 'phone' as const },
                                        sharesBackground: true,
                                        onPress: placeCall,
                                      },
                                    ]),
                              ],
                        unstable_headerLeftItems: () =>
                          glassHeader
                            ? []
                            : [
                                ...(headerIslands
                                  ? [{ type: 'custom' as const, element: back }]
                                  : canGoBack
                                    ? []
                                    : [
                                        {
                                          type: 'button' as const,
                                          label: t.back,
                                          icon: {
                                            type: 'sfSymbol' as const,
                                            name: 'chevron.left' as const,
                                          },
                                          onPress: leave,
                                        },
                                      ]),
                                { type: 'spacing' as const, spacing: headerGap },
                                { type: 'custom' as const, element: titleItem },
                              ],
                      }
                    : android
                      ? {
                          headerLeft: () => null,
                          headerRight: () => null,
                          headerTitle: () => null,
                        }
                      : {
                          headerTitleAlign: 'left' as const,
                          headerRight: () => headerActions,
                          headerTitle: () => (
                            <View
                              key={`${theme.scheme}:${theme.fontScale}:${bot?.displayName ?? channel?.name ?? ''}`}
                              style={{
                                width:
                                  dm || botDm
                                    ? undefined
                                    : windowWidth - (theme.touch + space.x5) * 2,
                                maxWidth:
                                  windowWidth -
                                  (theme.touch + space.x5) * 2 -
                                  (placeCall === undefined || !canOpenProfile ? 0 : theme.touch),
                                marginHorizontal: space.x3,
                              }}
                            >
                              {title}
                            </View>
                          ),
                          ...(canGoBack && !floatingHeader ? {} : { headerLeft: () => back }),
                        }),
                }}
              />
            ) : null}
            <EndSheet
              open={profileOpen}
              active={focused}
              enabled={canOpenProfile}
              fullWidth
              onOpening={prepareProfile}
              onOpenChange={(open) => {
                setProfileOpen(open);
                setProfileOpening(false);
              }}
              panel={
                android && profileVisited && saved != null ? (
                  <ProfileVisibility value={focused && (profileOpen || profileOpening)}>
                    <RevealProfileConversation value={() => setProfileOpen(false)}>
                      {dm ? (
                        <BotProfileScreen
                          {...profileHref.params}
                          onClose={() => setProfileOpen(false)}
                        />
                      ) : botDm ? (
                        <ChannelDetailsScreen
                          hostId={saved.hostId}
                          channelId={pairHref.params.channelId}
                          onClose={() => setProfileOpen(false)}
                        />
                      ) : (
                        <GroupProfileScreen
                          {...groupHref.params}
                          onClose={() => setProfileOpen(false)}
                        />
                      )}
                    </RevealProfileConversation>
                  </ProfileVisibility>
                ) : null
              }
            >
              <ChatBackdrop style={{ flex: 1 }}>
                <KeyboardChatFrame
                  onMount={screenRef}
                  backgroundColor={
                    background.kind === 'color' ? background.color : theme.color.base
                  }
                  background={
                    background.kind === 'image' ? (
                      <ChatBackground choice={background} imageUri={backgroundImageUri} />
                    ) : undefined
                  }
                  onComposerLayout={latest.onComposerLayout}
                  composer={
                    <ComposerPillContext.Provider value={nativeSpacer ? latest.pill : undefined}>
                      {android ? noticeView : null}
                      {missingGroup ? null : pickedTools !== undefined ? (
                        android ? (
                          <SelectionIslands
                            {...(composable ? { reply: { onPress: pickedTools.onReply } } : {})}
                            {...(activeChannel && saved
                              ? { feedback: { onPress: pickedTools.onFeedback } }
                              : {})}
                          />
                        ) : (
                          <SelectionBar {...pickedTools} />
                        )
                      ) : botDm ? (
                        <View style={{ padding: space.x5, alignItems: 'center' }}>
                          <Text variant="meta" tone="muted">
                            {t.activityRow.botDm}
                          </Text>
                        </View>
                      ) : (
                        <Composer
                          value={draft}
                          disabled={
                            conversation === undefined ||
                            host.connection.status !== 'connected' ||
                            !draftPersistence.loaded ||
                            draftPersistence.failed
                          }
                          files={files}
                          canAttach={files.length < MAX_PICKED}
                          dictation={dictation.state.status}
                          canDictate={conversation !== undefined}
                          onChange={edit}
                          selection={selection}
                          onSelection={(next) => {
                            setSelection(undefined);
                            setCaret(next);
                          }}
                          inside={android ? replyBar : undefined}
                          above={
                            <>
                              {android ? null : replyBar}
                              {draftPersistence.failed ? (
                                <DraftSaveNotice
                                  busy={retryingDraft}
                                  onRetry={() => void retryDraft()}
                                />
                              ) : null}
                              {skillChoices.length > 0 ? (
                                <SkillSuggestions options={skillChoices} onChoose={chooseSkill} />
                              ) : candidates.length > 0 ? (
                                <MentionSuggestions candidates={candidates} onChoose={mention} />
                              ) : clipboard.offered ? (
                                <ClipboardImageOffer
                                  onUnreadable={clipboard.used}
                                  onPaste={(data) => {
                                    clipboard.used();
                                    setAttachError(false);
                                    setFiles((current) =>
                                      [...current, fromClipboardImage(data)].slice(0, MAX_PICKED),
                                    );
                                  }}
                                />
                              ) : null}
                            </>
                          }
                          onSend={send}
                          onPick={pick}
                          onRemove={(id) =>
                            setFiles((current) => current.filter((file) => file.id !== id))
                          }
                          onDictate={() => {
                            setAttachError(false);
                            dictation.start({ text: draft, ...(typing ? { caret } : {}) });
                          }}
                          onStopDictation={dictation.stop}
                          onCancelDictation={dictation.cancel}
                          inputRef={composerInput}
                          onFocusChange={setTyping}
                        />
                      )}
                    </ComposerPillContext.Provider>
                  }
                >
                  {android ? null : noticeView}
                  {missingGroup ? (
                    <View
                      style={{
                        flex: 1,
                        paddingTop: headerOverlap + headerPadding,
                        paddingBottom: insets.bottom,
                      }}
                    >
                      <GroupUnavailable onBack={backToChats} />
                    </View>
                  ) : (
                    renderConversationTimeline({
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
                    })
                  )}
                </KeyboardChatFrame>
              </ChatBackdrop>
              {android ? (
                <ConversationTopBar
                  title={
                    dm
                      ? (bot?.displayName ?? slug ?? '')
                      : botDm
                        ? botDmName
                        : (channel?.name ?? channelName ?? t.groupInfo)
                  }
                  bot={dm ? bot : undefined}
                  avatar={person === undefined ? channel?.avatar : undefined}
                  initial={person === undefined ? undefined : (humanInitial(person.name) ?? '#')}
                  subtitle={headerStatus.label}
                  activeBots={headerStatus.bots}
                  connectionLabel={connectionLabel}
                  onBack={leave}
                  onProfile={canOpenProfile ? openProfile : undefined}
                  onCall={canOpenProfile ? placeCall : undefined}
                  onHeight={setMeasuredHeaderHeight}
                  selection={pickedTools}
                />
              ) : null}
            </EndSheet>
            {!android && paging === undefined ? (
              <ProfileSwipePreview
                travel={profileTravel}
                name={
                  dm ? (bot?.displayName ?? slug ?? '') : botDm ? botDmName : (channel?.name ?? '')
                }
                bot={dm ? bot : undefined}
                groupAvatar={channel?.avatar}
              />
            ) : null}
            {imageSelection?.scope === selectionScope ? (
              <SelectionScreenshot
                messages={imageSelection.messages}
                renderCard={(message) => {
                  const author = message.bot ?? slug;
                  return client && author && message.card ? (
                    <RequestCard
                      client={client}
                      inbox={inbox}
                      message={message}
                      card={message.card}
                      botSlug={author}
                      botName={botName(author)}
                      resolution={resolutions.get(message.id)}
                      focused={false}
                      replyInChat={dm}
                      answeredHere={answered.has(message.id)}
                      group={{ first: true, last: true }}
                    />
                  ) : (
                    <Text>{message.body}</Text>
                  );
                }}
                botName={botName}
                onClose={() => setImageSelection(undefined)}
              />
            ) : null}
            {viewing === undefined ? null : (
              <ImageViewer
                attachment={viewing}
                onClose={() => setViewing(undefined)}
                onShare={share}
              />
            )}
            <DeliverySheet
              message={
                deliveryFor === undefined
                  ? undefined
                  : snapshot.messages.find((message) => message.id === deliveryFor)
              }
              botName={botName}
              onClose={() => setDeliveryFor(undefined)}
              onOpenInbox={openInbox}
            />
            <MessageActions
              target={actionsFor}
              catalog={menuCatalog}
              readOnly={botDm || !online}
              onClose={() => setActionsFor(undefined)}
              onReact={(message, emoji, active) => react(message.id, emoji, active)}
              onCopy={copyMessage}
              onSelectCopy={
                Platform.OS === 'android' || Platform.OS === 'ios' ? selectSource : undefined
              }
              onShareText={shareText}
              onShareAttachment={share}
            />
            {sourceMessage === undefined ? null : (
              <MessageSourcePage
                key={selectionScope + ':' + sourceMessage.id}
                message={sourceMessage}
                onClose={closeSource}
                onCopy={copyMessage}
              />
            )}
            {paging === undefined ? null : (
              <NativePageHeader
                title={ios && glassHeader ? title : titleItem}
                onBack={leave}
                backID="chat-page-back"
                action={
                  canOpenProfile
                    ? { label: t.openProfile, testID: 'chat-profile-button', onPress: openProfile }
                    : undefined
                }
                call={
                  placeCall === undefined
                    ? undefined
                    : { label: t.call.button, testID: 'chat-call-button', onPress: placeCall }
                }
              />
            )}
          </GenuiInteraction>
        </GenuiViewHost>
      </ChatOffline>
    </ReplyPeopleContext.Provider>
  );
}
