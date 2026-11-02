import type { CloudConversation } from '../../cloud/conversations';
import type { ConnectedHost } from '../../host/host-session';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { chatList, PINNED_SECTION, type ChatListItem, type Conversation } from './conversations';
import { conversationChannelId } from './conversation-actions';

export type EnvironmentChatRow =
  | {
      key: string;
      environment: string;
      type: 'computer';
      conversation: Conversation;
      pinned: boolean;
      host: ConnectedHost;
      at?: string;
    }
  | {
      key: string;
      environment: string;
      type: 'cloud';
      conversation: CloudConversation;
      pinned: false;
      at?: string;
    };

type Section = Extract<ChatListItem, { kind: 'section' }> & {
  type: 'section';
  host?: ConnectedHost;
};
export type EnvironmentChatItem = EnvironmentChatRow | Section;
export const ALL_HOSTS_COLLAPSE = JSON.stringify(['view', 'all']);

export function environmentChatList(
  rows: EnvironmentChatRow[],
  environment: string,
  hosts: readonly ConnectedHost[],
  collapsed: ReadonlySet<string>,
  searching: boolean,
): EnvironmentChatItem[] {
  const visible = rows.filter((row) => environment === 'all' || row.environment === environment);
  if (searching) return visible;
  if (environment === 'all') {
    const pins = visible.filter((row) => row.pinned);
    if (pins.length === 0) return visible;
    const folded = collapsed.has(PINNED_SECTION);
    return [
      {
        type: 'section',
        kind: 'section',
        key: 'all:pinned',
        id: PINNED_SECTION,
        count: pins.length,
        collapsed: folded,
        needsYou: pins.reduce(
          (sum, row) => sum + (row.type === 'computer' ? row.conversation.needsYou : 0),
          0,
        ),
        unread: pins.reduce(
          (sum, row) =>
            sum +
            (row.type === 'computer' && !row.conversation.muted ? row.conversation.unread : 0),
          0,
        ),
      },
      ...(folded ? [] : pins),
      ...visible.filter((row) => !row.pinned),
    ];
  }
  const host = hosts.find((entry) => computerEnvironmentKey(entry.saved.hostId) === environment);
  if (!host || host.snapshot.connection.status !== 'connected') return visible;
  const byKey = new Map(
    visible.filter((row) => row.type === 'computer').map((row) => [row.conversation.key, row]),
  );
  const inbox = host.attention;
  return chatList(
    host.snapshot.roster,
    inbox.status === 'ready' ? inbox.sections.action : [],
    collapsed,
    inbox.status === 'ready' ? inbox.unread : {},
    visible.flatMap((row) => {
      if (row.type !== 'computer' || !row.conversation.muted) return [];
      const id = conversationChannelId(row.conversation);
      return id ? [id] : [];
    }),
  ).flatMap((item): EnvironmentChatItem[] => {
    if (item.kind === 'section') return [{ ...item, type: 'section', host }];
    const row = byKey.get(item.row.key);
    return row ? [row] : [];
  });
}
