import type { ChatPlace } from './chat-place';
import { useProfilePaging } from './profile-paging';
import { NativePageHeader } from '../primitives/native-page-navigation';
import { HostScope } from '../../host/host-scope';
import { takeSharedFiles } from '../share/incoming-share';
import { useIsFocused, useRouter, useNavigationContainerRef } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_PICKED } from '../../host/pick-files';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { botColor } from '../bot-color';
import { useChatHeaderHeight } from './header-chrome';
import { useStackRoot } from '../shell/stack-root';
import { useHeaderOverlap, useHeaderPadding } from './native-header';
import { nativeChatRecycler } from '../primitives/chat-list';
import { usePullToCompose } from './pull-to-compose';
import { chatHref, useRecentChat } from '../shell/recent-chats';
import { useMarkRead } from './mark-read';
import { MessageIdentities } from './message-identities';
import { useHostLook } from '../../host/native-host-look';
import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { LatestAnchor } from './latest-anchor';
import { AccentProvider, useDesignTheme } from '../design/theme';
import { pullToCompose } from '../design/tokens';
import { navigateChannel } from '../shell/channel-navigation';
import { leaveScreen } from '../shell/leave-screen';
import { Text } from '../primitives/text';
import { useListBottomSafeArea } from '../primitives/keyboard-frame';
import { useStrings } from '../strings';
import { useConversationSource } from './conversation-source';
import {
  useConversationDraft,
  useConversationComposer,
  useConversationDraftActions,
} from './conversation-composition';
import {
  useConversationMessageState,
  useConversationMessageActions,
} from './conversation-message-actions';
import { useConversationScrollState, useConversationFocusJump } from './conversation-focus';
import { useConversationTimeline, useConversationTimelineRows } from './conversation-timeline';
import { useConversationRowRendering, useIdentityBots } from './conversation-rows';
import {
  useConversationProfile,
  conversationHeader,
  conversationNotice,
} from './conversation-header';
import { renderConversation } from './conversation-layout';

export type { ChatPlace } from './chat-place';

export type ConversationPresentation = {
  active: boolean;
  onClose(): void;
  onNestedChange(open: boolean): void;
};

export function ConversationScreen({
  expectedHostId,
  place,
  focus,
  focusRequest,
  latestWindowOnly = false,
  presentation,
  active = true,
}: {
  place: ChatPlace;
  expectedHostId?: string | undefined;
  focus: string | undefined;
  focusRequest?: string | undefined;
  latestWindowOnly?: boolean;
  presentation?: ConversationPresentation;
  active?: boolean;
}) {
  const t = useStrings();
  const router = useRouter();
  const paging = useProfilePaging();
  const initial = useHostSession();
  const [openedOn, setOpenedOn] = useState(initial.saved?.hostId);
  if (openedOn === undefined && initial.saved?.hostId !== undefined)
    setOpenedOn(initial.saved.hostId);
  const { client, saved } = useHostSession(expectedHostId ?? openedOn);

  const routeFocused = useIsFocused();
  const focused = routeFocused && active && (presentation?.active ?? true);
  const roster = useHostSnapshot(client, focused).roster;
  const navigation = useNavigationContainerRef();
  const identityBots = useIdentityBots(roster?.bots);
  const hostLook = useHostLook(saved?.hostId);
  const identities = useMemo(
    () => ({
      bots: identityBots ?? [],
      ...(saved ? { host: { name: shownHostName(hostLook, saved.hostName), look: hostLook } } : {}),
      openBot: (slug: string) =>
        saved &&
        navigateChannel(navigation, {
          pathname: '/dm/[slug]',
          params: { slug, hostId: saved.hostId },
        }),
    }),
    [identityBots, hostLook, navigation, saved],
  );
  const bot =
    place.kind === 'dm' ? roster?.bots.find((entry) => entry.slug === place.slug) : undefined;
  const shownHostId = expectedHostId ?? openedOn;
  if (shownHostId && saved?.hostId !== shownHostId)
    return (
      <>
        <Text>{t.sourceChanged}</Text>
        {paging === undefined ? null : (
          <NativePageHeader onBack={paging.leaveChat} backID="chat-page-back" />
        )}
      </>
    );
  return (
    <HostScope value={saved?.hostId}>
      <AccentProvider accent={bot === undefined ? undefined : botColor(bot)}>
        <MessageIdentities.Provider value={identities}>
          <ChatConversation
            key={JSON.stringify([saved?.hostId, place])}
            place={place}
            focus={focus}
            focusRequest={focusRequest}
            latestWindowOnly={latestWindowOnly}
            focused={focused}
            presentation={presentation}
          />
        </MessageIdentities.Provider>
      </AccentProvider>
    </HostScope>
  );
}

function ChatConversation({
  place,
  focus: routeFocus,
  focusRequest: routeFocusRequest,
  latestWindowOnly,
  focused,
  presentation,
}: {
  focused: boolean;
  place: ChatPlace;
  focus: string | undefined;
  focusRequest: string | undefined;
  latestWindowOnly: boolean;
  presentation: ConversationPresentation | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const paging = useProfilePaging();
  const routeFocusKey = `${routeFocus ?? ''}\n${routeFocusRequest ?? ''}`;
  const [replyFocus, setReplyFocus] = useState<
    { message: string; request: string; route: string } | undefined
  >(undefined);
  const replyFocused = replyFocus !== undefined && replyFocus.route === routeFocusKey;
  const focus = replyFocused ? replyFocus.message : routeFocus;
  const focusRequest = replyFocused ? replyFocus.request : routeFocusRequest;
  const replySequence = useRef(0);
  const openReply = useCallback(
    (message: string) => {
      replySequence.current += 1;
      setReplyFocus({ message, request: `reply-${replySequence.current}`, route: routeFocusKey });
    },
    [routeFocusKey],
  );
  const navigation = useNavigationContainerRef();
  const headerOverlap = useHeaderOverlap();
  const nativeHeaderPadding = useHeaderPadding();
  const inlineHeaderHeight = useChatHeaderHeight();
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  const nativeSpacer = !android && LatestAnchor !== undefined;
  const headerPadding = android ? measuredHeaderHeight || inlineHeaderHeight : nativeHeaderPadding;
  const [profileOpen, setProfileOpen] = useState(false);
  const nestedChange = presentation?.onNestedChange;
  useLayoutEffect(() => {
    nestedChange?.(profileOpen);
    return () => nestedChange?.(false);
  }, [nestedChange, profileOpen]);
  const [profileVisited, setProfileVisited] = useState(false);
  const [profileOpening, setProfileOpening] = useState(false);
  const prepareProfile = () => {
    setProfileVisited(true);
    setProfileOpening(true);
    Keyboard.dismiss();
  };
  const { width: windowWidth } = useWindowDimensions();
  const listSafeArea = useListBottomSafeArea();
  const source = useConversationSource({ place, focused });
  const { client, inbox, saved, bot, channel, botDm, conversation, activeChannel, snapshot } =
    source;
  const draftState = useConversationDraft({ place, source });
  const { draftKey, setFiles, dictation } = draftState;
  const messageState = useConversationMessageState({ focused, source });
  const scrollState = useConversationScrollState({ focus, focusRequest, android });
  const timeline = useConversationTimeline({ focus, headerOverlap, android, source, scrollState });
  const { scroll, viewport, content, latest, resolutions } = timeline;
  const composer = useConversationComposer({
    focused,
    headerOverlap,
    android,
    headerPadding,
    profileOpen,
    profileOpening,
    source,
    draftState,
    messageState,
    timeline,
  });
  const { viewportLayout, composable, compose } = composer;
  const stackRoot = useStackRoot();
  const closePresentation = presentation?.onClose;
  const leave = useCallback(() => {
    if (closePresentation) closePresentation();
    else if (paging) paging.leaveChat();
    else leaveScreen(router);
  }, [router, closePresentation, paging]);
  const pull = usePullToCompose({
    inverted: android,
    enabled: composable || stackRoot,
    threshold: pullToCompose.threshold,
    flick: Platform.OS === 'android' ? pullToCompose.flick : undefined,
    onCompose: stackRoot ? leave : compose,
  });
  const markdownViewport = useMemo(
    () => ({
      scroll,
      viewport,
      content: nativeChatRecycler ? undefined : content,
      layout: viewportLayout,
      active: focused,
      inverted: android,
    }),
    [scroll, viewport, content, viewportLayout, focused, android],
  );
  const readMount = useMarkRead(
    client,
    inbox,
    focused ? conversation : undefined,
    activeChannel,
    focused && !latest.away,
  );
  const recentMount = useRecentChat(
    !focused || botDm
      ? undefined
      : bot !== undefined
        ? {
            id: `dm:${saved?.hostId ?? ''}:${bot.slug}`,
            title: bot.displayName,
            href: chatHref(`/dm/${encodeURIComponent(bot.slug)}`, saved?.hostId),
          }
        : channel !== undefined
          ? {
              id: `channel:${saved?.hostId ?? ''}:${channel.id}`,
              title: channel.name,
              href: chatHref(`/channel/${encodeURIComponent(channel.id)}`, saved?.hostId),
            }
          : undefined,
  );
  const sharedMount = useCallback(
    (node: unknown) => {
      if (node === null || !focused) return;
      const shared = takeSharedFiles(draftKey);
      if (shared.length > 0) setFiles((current) => [...current, ...shared].slice(0, MAX_PICKED));
    },
    [draftKey, focused],
  );
  const mountRef = dictation.mountRef;
  const screenRef = useCallback(
    (node: unknown) => {
      const visibleNode = focused ? node : null;
      mountRef(visibleNode);
      readMount(visibleNode);
      recentMount(visibleNode);
      sharedMount(visibleNode);
    },
    [mountRef, readMount, recentMount, sharedMount, focused],
  );
  const asking = snapshot.messages.findLast(
    (message) => message.card?.kind === 'user-question' && !resolutions.has(message.id),
  );
  const timelineRows = useConversationTimelineRows({ android, source, timeline });
  const { rows } = timelineRows;
  const focusJump = useConversationFocusJump({
    latestWindowOnly,
    focused,
    focus,
    focusRequest,
    source,
    scrollState,
    timeline,
    timelineRows,
  });
  const draftActions = useConversationDraftActions({
    t,
    asking,
    source,
    draftState,
    messageState,
    timeline,
    composer,
  });
  const messageActions = useConversationMessageActions({ router, source, messageState });
  const rowRendering = useConversationRowRendering({
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
  });
  const profile = useConversationProfile({
    focused,
    t,
    theme,
    router,
    paging,
    android,
    profileOpen,
    setProfileOpen,
    prepareProfile,
    stackRoot,
    closePresentation,
    source,
    messageState,
    rowRendering,
  });
  const ios = Platform.OS === 'ios';
  const openAtLatest =
    ios && process.env.EXPO_PUBLIC_IOS_OPEN_AT_LATEST !== '0' && focus === undefined;
  const [openedAtLatest, setOpenedAtLatest] = useState(false);
  if (!openedAtLatest && openAtLatest && rows.length > 0) setOpenedAtLatest(true);
  const header = conversationHeader({ t, theme, insets, windowWidth, leave, ios, profile });
  const notice = conversationNotice({
    latestWindowOnly,
    t,
    router,
    focus,
    headerOverlap,
    android,
    headerPadding,
    source,
    draftState,
    messageState,
    timelineRows,
    profile,
  });
  return renderConversation({
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
  });
}
