import type { RosterSection } from '../../host/client';
import type { DeletionTarget } from '../../host/deletion';
import type { ItemMenuAction } from '../primitives/item-menu';
import { t } from '../strings';
import {
  conversationActions,
  conversationChannelId,
  type ConversationActionKey,
} from './conversation-actions';
import type { Conversation } from './conversations';

export function conversationMenu(
  conversation: Conversation,
  options: {
    pinned: boolean;
    hostMuted: boolean;
    sections: readonly RosterSection[];
    onAction(key: ConversationActionKey): void;
    onMove(sectionId: string | null): void;
    onDelete(target: DeletionTarget): void;
  },
): ItemMenuAction[] {
  const actions: ItemMenuAction[] = conversationActions(conversation, options).map((action) => ({
    ...action,
    icon:
      action.key === 'section'
        ? 'folder'
        : action.key === 'read'
          ? 'checkmark'
          : action.key === 'pin' || action.key === 'unpin'
            ? 'pin'
            : action.key === 'mute'
              ? 'bell.slash'
              : 'bell',
    glyph: action.key === 'section' ? 'folder' : action.key === 'read' ? 'check' : action.key,
    run: () => options.onAction(action.key),
  }));
  if (conversationChannelId(conversation)) {
    actions.push(
      ...options.sections.map((section) => ({
        key: `move:${section.id}`,
        glyph: 'folder' as const,
        icon: 'folder' as const,
        label: `${t.deletion.move}: ${section.name}`,
        run: () => options.onMove(section.id),
      })),
    );
    if (options.sections.length > 0)
      actions.push({
        key: 'move:none',
        glyph: 'folder',
        icon: 'folder',
        label: t.deletion.unsectioned,
        run: () => options.onMove(null),
      });
  }
  if (conversation.kind === 'channel')
    actions.push({
      key: 'delete',
      glyph: 'delete',
      icon: 'trash',
      label: t.deletion.disband,
      destructive: true,
      run: () =>
        options.onDelete({
          kind: 'group',
          id: conversation.channel.id,
          name: conversation.channel.name,
        }),
    });
  else if (!conversation.bot.tob)
    actions.push({
      key: 'delete',
      glyph: 'delete',
      label: t.deletion.deleteBot,
      destructive: true,
      run: () =>
        options.onDelete({
          kind: 'bot',
          id: conversation.bot.slug,
          name: conversation.bot.displayName,
        }),
    });
  return actions;
}
