import { useHeaderStatus } from './use-header-status';
import { HeaderTitleButton } from './header-title-button';
import type { useProfilePaging } from './profile-paging';
import { ConnectionProgress, useConnectionPresence } from '../primitives/connection-progress';
import { StatusChip } from '../primitives/status-chip';
import type { useRouter } from 'expo-router';
import { useLayoutEffect, useMemo } from 'react';
import { Keyboard, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChannelTitle } from './channel-title';
import { ChatHeaderRow } from './chat-header-row';
import { WorkingStatus } from './working-status';
import { ChatTitle } from './chat-title';
import { runningSessionCount } from '../../host/session-stop';
import { HeaderActionGroup, HeaderBackButton, titleChipFill } from './header-chrome';
import {
  barLabelStyle,
  barLabelProps,
  glassHeader,
  headerIslands,
  headerControlHeight,
} from './native-header';
import { swipeEntry } from '../shell/swipe-entry';
import { pressTint, type useDesignTheme } from '../design/theme';
import { glassPress, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import type { useStrings } from '../strings';
import { useBotCall } from './call-button';
import type { Dispatch, SetStateAction } from 'react';
import type { useConversationSource } from './conversation-source';
import type { useConversationMessageState } from './conversation-message-actions';
import type { useConversationRowRendering } from './conversation-rows';
import type { useConversationDraft } from './conversation-composition';
import type { useConversationTimelineRows } from './conversation-timeline';
import type { ConversationPresentation } from './conversation-screen';

export function useConversationProfile({
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
}: {
  focused: boolean;
  t: ReturnType<typeof useStrings>;
  theme: ReturnType<typeof useDesignTheme>;
  router: ReturnType<typeof useRouter>;
  paging: ReturnType<typeof useProfilePaging>;
  android: boolean;
  profileOpen: boolean;
  setProfileOpen: Dispatch<SetStateAction<boolean>>;
  prepareProfile: () => void;
  stackRoot: boolean;
  closePresentation: ConversationPresentation['onClose'] | undefined;
  source: ReturnType<typeof useConversationSource>;
  messageState: Pick<
    ReturnType<typeof useConversationMessageState>,
    'initiatedRequest' | 'selected'
  >;
  rowRendering: Pick<ReturnType<typeof useConversationRowRendering>, 'roster'>;
}) {
  const {
    client,
    saved,
    host,
    dm,
    slug,
    channelId,
    bot,
    person,
    channel,
    channelDetails,
    botDm,
    channelName,
    members,
    working,
    activeChannel,
    snapshot,
  } = source;
  const { initiatedRequest, selected } = messageState;
  const { roster } = rowRendering;
  const hostRefused = host.connection.status === 'refused';
  const hostRefusal = host.connection.status === 'refused' ? host.connection.code : undefined;
  const presence = useConnectionPresence(
    host.connection.status,
    snapshot.status === 'interrupted',
    host.disruptedSince,
  );
  const connectionLabel = presence.label;
  const missing =
    host.roster !== undefined && (dm ? bot === undefined : channel === undefined && !botDm);
  const missingGroup = missing && !dm && !hostRefused && snapshot.status !== 'refused';
  useLayoutEffect(() => {
    if (missingGroup && focused) Keyboard.dismiss();
  }, [missingGroup, focused]);
  const backToChats = () => (closePresentation ? closePresentation() : router.dismissTo('/'));
  const profileTravel = useSharedValue(0);
  const canGoBack = !stackRoot && router.canGoBack();
  const botDmName =
    channelDetails?.members
      .map(
        (member) =>
          roster?.bots.find((entry) => entry.slug === member)?.displayName ??
          t.activityRow.unavailableBot,
      )
      .join('、') ?? '';
  const profileHref = {
    pathname: '/bot/[slug]' as const,
    params: {
      slug: bot?.slug ?? slug ?? '',
      ...(saved?.hostId === undefined ? {} : { hostId: saved.hostId }),
      ...(activeChannel ? { channelId: activeChannel } : {}),
      ...(initiatedRequest?.hostId === saved?.hostId &&
      initiatedRequest?.botSlug === slug &&
      initiatedRequest?.messageId !== undefined
        ? { activityMessageId: initiatedRequest.messageId }
        : {}),
    },
  };
  const pairHref = {
    pathname: '/channel-details' as const,
    params: {
      channelId: channelDetails?.id ?? '',
      ...(saved?.hostId === undefined ? {} : { hostId: saved.hostId }),
    },
  };
  const groupHref = {
    pathname: '/group/[id]' as const,
    params: {
      id: channel?.id ?? channelId ?? '',
      ...(saved?.hostId === undefined ? {} : { hostId: saved.hostId }),
    },
  };
  const pairChip = (press: (() => void) | undefined) => (
    <HeaderTitleButton
      kind="button"
      testID="channel-details-chip"
      accessibilityLabel={[botDmName, connectionLabel].filter(Boolean).join(', ')}
      android_ripple={{ color: pressTint(theme.color.fg), borderless: false }}
      accessibilityState={{ busy: connectionLabel !== undefined }}
      disabled={!saved || hostRefused}
      onPress={press}
      style={({ pressed }) => ({
        minHeight: glassHeader ? headerControlHeight(theme) : theme.touch,
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingHorizontal: theme.touch / 2,
        borderRadius: radius.round,
        ...titleChipFill(theme, pressed),
        overflow: 'hidden',
      })}
    >
      <Text {...barLabelProps} strong numberOfLines={1} style={[{ flexShrink: 1 }, barLabelStyle]}>
        {botDmName}
      </Text>
      <ConnectionProgress active={connectionLabel !== undefined} label={connectionLabel} />
      <WorkingStatus bots={working} />
    </HeaderTitleButton>
  );
  const profileActivity = useMemo(
    () => ({
      channelId: activeChannel,
      messageId:
        initiatedRequest !== undefined &&
        initiatedRequest.hostId === saved?.hostId &&
        initiatedRequest.botSlug === slug
          ? initiatedRequest.messageId
          : undefined,
    }),
    [activeChannel, initiatedRequest, saved?.hostId, slug],
  );
  useLayoutEffect(() => {
    paging?.setActivity(profileActivity);
  }, [paging?.setActivity, profileActivity]);
  const canSwipeProfile =
    saved !== undefined &&
    !hostRefused &&
    !missing &&
    selected === undefined &&
    person === undefined;
  useLayoutEffect(() => {
    paging?.setEnabled(canSwipeProfile);
  }, [paging?.setEnabled, canSwipeProfile]);
  const pushProfile = dm
    ? () => router.push(profileHref)
    : botDm
      ? () => router.push(pairHref)
      : () => router.push(groupHref);
  const openProfile = android
    ? () => {
        prepareProfile();
        setProfileOpen(true);
      }
    : (paging?.open ?? pushProfile);
  const swipeProfile = dm
    ? () => router.push({ ...profileHref, params: { ...profileHref.params, entry: swipeEntry } })
    : botDm
      ? () => router.push({ ...pairHref, params: { ...pairHref.params, entry: swipeEntry } })
      : () => router.push({ ...groupHref, params: { ...groupHref.params, entry: swipeEntry } });
  const headerStatus = useHeaderStatus(dm ? bot : undefined, channel, members);
  const title = dm ? (
    <ChatTitle
      bot={bot}
      connectionLabel={connectionLabel}
      fallback={slug ?? ''}
      onPress={openProfile}
    />
  ) : botDm ? (
    pairChip(saved && !hostRefused ? openProfile : undefined)
  ) : (
    <ChannelTitle
      channel={channel}
      person={person !== undefined}
      bots={members}
      sessions={runningSessionCount(members)}
      connectionLabel={connectionLabel}
      fallback={channelName ?? t.groupInfo}
      onPress={openProfile}
    />
  );
  const canOpenProfile =
    saved !== undefined &&
    !hostRefused &&
    !missing &&
    selected === undefined &&
    person === undefined;
  const placeCall = useBotCall(
    canOpenProfile && dm && bot !== undefined ? client : undefined,
    slug,
    saved?.hostId,
    host.connection.status === 'connected',
    focused,
  );
  return {
    hostRefused,
    hostRefusal,
    presence,
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
  };
}

export function conversationHeader({
  t,
  theme,
  insets,
  windowWidth,
  leave,
  ios,
  profile,
}: {
  t: ReturnType<typeof useStrings>;
  theme: ReturnType<typeof useDesignTheme>;
  insets: ReturnType<typeof useSafeAreaInsets>;
  windowWidth: number;
  leave: () => void;
  ios: boolean;
  profile: Pick<
    ReturnType<typeof useConversationProfile>,
    'openProfile' | 'title' | 'canOpenProfile' | 'placeCall'
  >;
}) {
  const { openProfile, title, canOpenProfile, placeCall } = profile;
  const headerGap = glassPress.gap;
  const headerActions = canOpenProfile ? (
    <HeaderActionGroup
      actions={[
        ...(placeCall === undefined
          ? []
          : [
              {
                icon: 'call' as const,
                label: t.call.button,
                testID: 'chat-call-button',
                onPress: placeCall,
              },
            ]),
        { icon: 'more', label: t.openProfile, testID: 'chat-profile-button', onPress: openProfile },
      ]}
    />
  ) : null;
  const titleWidth = Math.max(
    0,
    windowWidth -
      insets.left -
      insets.right -
      space.x5 * 2 -
      theme.touch -
      headerGap * 2 -
      (ios && glassHeader && canOpenProfile && placeCall !== undefined
        ? theme.touch * 2
        : (theme.touch +
            (ios ? Math.min(space.x3, Math.max(0, (theme.fontScale - 1) * space.x3)) : 0)) *
          (canOpenProfile && placeCall !== undefined ? 2 : 1)) -
      (ios && glassHeader ? space.x4 * 2 : 0),
  );
  const nativeHeaderRow =
    ios && glassHeader ? (
      <ChatHeaderRow
        title={title}
        back={{ label: t.back, testID: 'chat-back-button', onPress: leave }}
        controls={{
          kind: 'actions',
          actions: [
            ...(placeCall === undefined
              ? []
              : [
                  {
                    icon: 'call' as const,
                    label: t.call.button,
                    testID: 'chat-call-button',
                    onPress: placeCall,
                  },
                ]),
            ...(canOpenProfile
              ? [
                  {
                    icon: 'more' as const,
                    label: t.openProfile,
                    testID: 'chat-profile-button',
                    onPress: openProfile,
                  },
                ]
              : []),
          ],
        }}
      />
    ) : null;
  const back = <HeaderBackButton plain={!headerIslands} onPress={leave} />;
  const titleItem = <View style={{ width: titleWidth, maxWidth: titleWidth }}>{title}</View>;
  return { headerGap, headerActions, nativeHeaderRow, back, titleItem };
}

export function conversationNotice({
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
}: {
  latestWindowOnly: boolean;
  t: ReturnType<typeof useStrings>;
  router: ReturnType<typeof useRouter>;
  focus: string | undefined;
  headerOverlap: number;
  android: boolean;
  headerPadding: number;
  source: Pick<
    ReturnType<typeof useConversationSource>,
    'client' | 'saved' | 'host' | 'dm' | 'snapshot'
  >;
  draftState: Pick<ReturnType<typeof useConversationDraft>, 'attachError'>;
  messageState: Pick<ReturnType<typeof useConversationMessageState>, 'shareError' | 'reactError'>;
  timelineRows: Pick<ReturnType<typeof useConversationTimelineRows>, 'rows'>;
  profile: ReturnType<typeof useConversationProfile>;
}) {
  const { client, saved, host, dm, snapshot } = source;
  const { attachError } = draftState;
  const { shareError, reactError } = messageState;
  const { rows } = timelineRows;
  const { hostRefused, hostRefusal, presence, missing, missingGroup, backToChats } = profile;
  const notice = missingGroup
    ? undefined
    : hostRefused
      ? hostRefusal === 'sign-in-required'
        ? t.hostSignInRequired
        : hostRefusal === 'member-suspended'
          ? t.hostMemberSuspended
          : t.refused
      : snapshot.status === 'refused'
        ? dm
          ? t.dmRefused
          : t.channelRefused
        : missing
          ? dm
            ? t.noBot
            : t.noChannel
          : presence.offline || (snapshot.fromCache && host.connection.status === 'stopped')
            ? t.offline
            : snapshot.status === 'interrupted' && host.connection.status === 'stopped'
              ? t.liveInterrupted
              : attachError
                ? t.attachFailed
                : shareError
                  ? t.shareFailed
                  : reactError
                    ? t.reactFailed
                    : focus !== undefined &&
                        !latestWindowOnly &&
                        snapshot.status === 'live' &&
                        !snapshot.hasOlder &&
                        !snapshot.loadingOlder &&
                        !rows.some((row) => row.kind === 'message' && row.message.id === focus)
                      ? t.messageFocusUnavailable
                      : undefined;

  const noticeView =
    notice === undefined ? null : (
      <View
        pointerEvents="box-none"
        style={
          android
            ? { paddingHorizontal: space.x5, paddingBottom: space.x3 }
            : {
                position: 'absolute',
                zIndex: 1,
                top: headerOverlap + headerPadding + space.x3,
                left: space.x5,
                right: space.x5,
              }
        }
      >
        <StatusChip
          testID="chat-status-chip"
          label={notice}
          tone={
            hostRefused || notice === t.dmRefused || notice === t.channelRefused
              ? 'danger'
              : 'warning'
          }
          action={
            hostRefusal === 'sign-in-required' && saved
              ? {
                  label: t.teamSignIn.again,
                  testID: 'chat-sign-in-again',
                  onPress: () =>
                    router.push({ pathname: '/pair/team', params: { host: saved.hostId } }),
                }
              : hostRefusal === 'member-suspended'
                ? undefined
                : hostRefused
                  ? { label: t.pairAgain, onPress: () => router.push('/pair') }
                  : notice === t.offline && host.connection.status !== 'stopped'
                    ? {
                        label: t.retry,
                        testID: 'chat-connection-retry',
                        onPress: () => client?.retryNow(),
                      }
                    : notice === t.noBot || notice === t.noChannel
                      ? { label: t.backToChats, onPress: backToChats }
                      : undefined
          }
        />
      </View>
    );
  return { noticeView };
}
