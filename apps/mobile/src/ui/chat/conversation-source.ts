import type { ChatPlace } from './chat-place';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { chatBackgrounds, useChatBackgrounds } from '../../host/native-chat-background';
import { useHiddenDmActivity } from '../../host/native-dm-activity';
import { useMessageDisplay } from '../../host/native-message-display';
import { useDeliveryReceiptPreferences } from '../../host/native-delivery-receipts';
import { type ConversationDraftReference } from '@botharness/host-client/conversation';
import {
  useChannelConversation,
  useConversation,
  useConversationTimelineSnapshot,
  useStreamPlayback,
  useHostSession,
  useHostSnapshot,
} from '../../host/host-session';
import { botBusy } from './bot-tone';

const NO_DRAFTS: ConversationDraftReference[] = [];

function useDraftSlots<T extends { draftId: string; botSlug: string }>(
  drafts: readonly T[],
): readonly T[] {
  const last = useRef<{ key: string; drafts: readonly T[] }>(undefined);
  const key = drafts.map((draft) => `${draft.draftId}\u0000${draft.botSlug}`).join('\u0001');
  if (last.current?.key !== key) last.current = { key, drafts };
  return last.current.drafts;
}

export function useConversationSource({ place, focused }: { place: ChatPlace; focused: boolean }) {
  const { client, inbox, saved } = useHostSession();
  const host = useHostSnapshot(client, focused);
  const dm = place.kind === 'dm';
  const slug = dm ? place.slug : undefined;
  const hiddenActivity = useHiddenDmActivity(saved?.hostId, slug);
  const channelId = dm ? undefined : place.channelId;
  const bot = dm ? host.roster?.bots.find((entry) => entry.slug === slug) : undefined;
  const person = dm ? undefined : host.roster?.people?.find((entry) => entry.id === channelId);
  const channel = dm
    ? undefined
    : (host.roster?.channels.find((entry) => entry.id === channelId) ?? person);
  const channelDetails = dm
    ? undefined
    : host.roster?.activityChannels?.find((entry) => entry.id === channelId);
  const botDm =
    person === undefined &&
    channelDetails?.type === 'dm' &&
    channelDetails.botSlug === undefined &&
    (channelDetails.humanParticipants?.length ?? 0) === 0;
  const [lastChannelName, setLastChannelName] = useState({
    hostId: saved?.hostId,
    channelId,
    name: channel?.name,
  });
  useLayoutEffect(() => {
    if (channel !== undefined) {
      setLastChannelName((previous) =>
        previous.hostId === saved?.hostId &&
        previous.channelId === channelId &&
        previous.name === channel.name
          ? previous
          : { hostId: saved?.hostId, channelId, name: channel.name },
      );
    }
  }, [saved?.hostId, channelId, channel?.name]);
  const channelName =
    lastChannelName.hostId === saved?.hostId && lastChannelName.channelId === channelId
      ? lastChannelName.name
      : undefined;

  const target = useMemo(
    () =>
      slug === undefined
        ? undefined
        : {
            slug,
            ...(bot === undefined ? {} : { displayName: bot.displayName }),
            ...(bot?.dmChannelId === undefined ? {} : { dmChannelId: bot.dmChannelId }),
          },
    [slug, bot !== undefined],
  );
  const dmConversation = useConversation(client, target);
  const channelConversation = useChannelConversation(client, channelId);
  const conversation = dm ? dmConversation : channelConversation;
  const members = useMemo(
    () =>
      channel === undefined
        ? []
        : (host.roster?.bots ?? []).filter((entry) => channel.members.includes(entry.slug)),
    [channel, host.roster],
  );
  const working = dm ? (bot !== undefined && botBusy(bot) ? [bot] : []) : members.filter(botBusy);
  const activeChannel = dm ? bot?.dmChannelId : channelId;
  useChatBackgrounds();
  const background = chatBackgrounds.resolve(
    saved && activeChannel ? { hostId: saved.hostId, channelId: activeChannel } : undefined,
  );
  const display = useMessageDisplay();
  const receiptPreference = useDeliveryReceiptPreferences();
  const receipts = receiptPreference.loaded && receiptPreference.enabled;
  const playback = useStreamPlayback(conversation, display.loaded && display.mode === 'streaming');
  const snapshot = useConversationTimelineSnapshot(conversation, playback, focused);
  const shownDrafts = useDraftSlots(
    display.loaded && display.mode === 'streaming' ? snapshot.drafts : NO_DRAFTS,
  );
  return {
    client,
    inbox,
    saved,
    host,
    dm,
    slug,
    hiddenActivity,
    channelId,
    bot,
    person,
    channel,
    channelDetails,
    botDm,
    channelName,
    conversation,
    members,
    working,
    activeChannel,
    background,
    receipts,
    playback,
    snapshot,
    shownDrafts,
  };
}
