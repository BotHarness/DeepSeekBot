import type { HostClient, RosterView } from '@botharness/host-client/client';
import { markChannelRead } from '@botharness/host-client/channel-messages';
import {
  NATIVE_SESSION_ATTENTION_KIND,
  type HumanAttentionItem,
} from '@botharness/host-protocol/wire';
import { channelDestination, navigateChannel, type ChannelNavigation } from './channel-navigation';

export type InboxHref =
  | { pathname: '/inbox/[id]'; params: Record<string, string> }
  | {
      pathname: '/session/[id]';
      params: { id: string; hostId: string; source: 'native'; title?: string };
    };

const channelKinds = new Set([
  'channel-unread',
  'channel-reply',
  'channel-mention',
  'tool-approval',
  'user-question',
  'workspace-grant-request',
]);

export function openActivityItem(
  navigation: ChannelNavigation,
  source: { hostId: string; client: HostClient; roster: RosterView | undefined },
  item: HumanAttentionItem,
  push: (href: InboxHref) => void,
): void {
  const native = item.kind === NATIVE_SESSION_ATTENTION_KIND ? item.nativeSession : undefined;
  if (native !== undefined) {
    push({
      pathname: '/session/[id]',
      params: {
        id: native.sessionId,
        hostId: source.hostId,
        source: 'native',
        ...(native.sessionTitle === undefined ? {} : { title: native.sessionTitle }),
      },
    });
    return;
  }
  const destination = channelKinds.has(item.kind)
    ? channelDestination(source.hostId, item, source.roster)
    : undefined;
  if (destination && navigateChannel(navigation, destination)) {
    if (
      (item.kind === 'channel-reply' || item.kind === 'channel-mention') &&
      item.isUnread === true &&
      item.channelId !== undefined &&
      item.messageId !== undefined
    )
      void markChannelRead(source.client, item.channelId, item.messageId).catch(() => undefined);
    return;
  }
  push({
    pathname: '/inbox/[id]',
    params: {
      hostId: source.hostId,
      id: item.id,
      kind: item.kind,
      botSlug: item.botSlug,
      summary: item.summary,
      ...(item.channelId === undefined ? {} : { channelId: item.channelId }),
      ...(item.messageId === undefined ? {} : { messageId: item.messageId }),
      ...(item.kind === 'bot-message-needs-repair' ? { clearOnOpen: '1' } : {}),
    },
  });
}
