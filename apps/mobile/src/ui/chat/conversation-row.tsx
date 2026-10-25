import type { ReactNode, Ref } from 'react';
import type { Href } from 'expo-router';
import { SourceName } from './source-name';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';

import { BotAvatar } from '../bot-avatar';
import type { HostLook } from '../design/host-look';
import { chatList, edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { CountBadge } from '../primitives/count-badge';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { GroupMark } from './group-mark';
import {
  countBadge,
  previewText,
  rowLabel,
  rowStatus,
  shortTime,
  titleOf,
  type Conversation,
  type RowStatus,
} from './conversations';
import { RowStatusGlyph } from './row-status-glyph';
import type { ConversationAction, ConversationActionKey } from './conversation-actions';
import { ConversationSwipe } from './conversation-swipe';
import { ConversationPeek, type ConversationPeekAction } from '../shell/conversation-peek';
import { showActionMenu } from '../primitives/app-dialog';

const AVATAR = 48;
const RING = 6;

export const AVATAR_EDGE = chatList.gutter;

export function ConversationRow({
  row,
  now,
  onPress,
  actions = [],
  onAction,
  look,
  sourceLabel,
  previewHref,
  menuActions: suppliedMenuActions,
  onLongPress,
  onMenu,
}: {
  row: Conversation;
  now: Date;
  look?: HostLook | undefined;
  sourceLabel?: string | undefined;
  previewHref?: Href | undefined;
  menuActions?: readonly ConversationPeekAction[];
  onLongPress?: (() => void) | undefined;
  onMenu?: (() => void) | undefined;
  onPress?: () => void;
  actions?: readonly ConversationAction[];
  onAction?: (key: ConversationActionKey) => void;
}) {
  const t = useStrings();
  const title = titleOf(row);
  const status = rowStatus(row, now);
  const latest = row.kind === 'bot' ? row.bot.preview : row.channel.preview;
  const preview =
    latest !== undefined
      ? previewText(latest)
      : row.kind === 'bot'
        ? row.bot.paused
          ? t.paused
          : ''
        : t.members(row.channel.memberCount);
  const badge = countBadge(row);
  const time = shortTime(row.at, now);
  const description = rowLabel(row, title, status, preview);
  const label = sourceLabel ? `${description}, ${sourceLabel}` : description;
  const act = onAction ?? (() => undefined);
  const availableActions = onAction ? actions : [];
  const menuActions: readonly ConversationPeekAction[] =
    suppliedMenuActions ??
    availableActions.map((action) => ({
      key: action.key,
      label: action.label,
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
      run: () => act(action.key),
    }));
  const avatar =
    row.kind === 'bot' ? (
      <AvatarSlot>
        <BotAvatar bot={row.bot} size={AVATAR} corner={radius.md} ring={false} />
      </AvatarSlot>
    ) : (
      <ConversationGroupAvatar avatar={row.channel.avatar} />
    );
  const frame = (
    <ConversationRowFrame
      testID={`conversation-row-${row.key}`}
      actions={onAction ? actions : []}
      onAction={act}
      title={title}
      sourceLabel={sourceLabel}
      source="computer"
      look={look}
      label={label}
      preview={preview}
      time={time}
      status={status}
      unread={row.unread > 0 && !row.muted}
      badge={badge}
      onPress={previewHref ? undefined : onPress}
      onLongPress={
        onLongPress ??
        (Platform.OS === 'android' && availableActions.length > 0
          ? () =>
              showActionMenu(
                title,
                availableActions
                  .filter((action) => action.key !== 'read')
                  .map((action) => ({
                    text: action.label,
                    icon:
                      action.key === 'read'
                        ? ('check' as const)
                        : action.key === 'section'
                          ? ('folder' as const)
                          : action.key,
                    onPress: () => act(action.key),
                  })),
                avatar,
              )
          : undefined)
      }
      onMenu={onMenu}
      avatar={avatar}
    />
  );
  const content = previewHref ? (
    <ConversationPeek href={previewHref} actions={menuActions}>
      {frame}
    </ConversationPeek>
  ) : (
    frame
  );
  return Platform.OS === 'android' ? (
    content
  ) : (
    <ConversationSwipe actions={availableActions} onAction={act}>
      {content}
    </ConversationSwipe>
  );
}

function AvatarSlot({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        width: AVATAR + RING,
        height: AVATAR + RING,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

export function ConversationGroupAvatar({ avatar }: { avatar?: string | undefined }) {
  return (
    <AvatarSlot>
      <GroupMark avatar={avatar} size={AVATAR} corner={radius.md} variant="title" strong={false} />
    </AvatarSlot>
  );
}

export function ConversationRowFrame({
  title,
  sourceLabel,
  source,
  label,
  preview,
  time = '',
  status = 'none',
  unread = false,
  badge,
  avatar,
  onPress,
  onLongPress,
  disabled = false,
  actions = [],
  onAction,
  testID,
  onMenu,
  look,
  ref,
}: {
  sourceLabel?: string | undefined;
  ref?: Ref<ViewInstance>;

  look?: HostLook | undefined;
  actions?: readonly ConversationAction[];
  onAction?: (key: ConversationActionKey) => void;
  title: string;
  source: 'computer' | 'cloud';
  label: string;
  preview: string;
  time?: string;
  status?: RowStatus;
  unread?: boolean;
  badge?: ReturnType<typeof countBadge>;
  avatar: ReactNode;
  onPress?: (() => void) | undefined;
  onLongPress?: (() => void) | undefined;
  disabled?: boolean;
  testID?: string;
  onMenu?: (() => void) | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <Pressable
      ref={ref}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled || onPress === undefined}
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      accessibilityLabel={label}
      accessibilityActions={[
        ...actions.map((action) => ({ name: action.key, label: action.label })),
        ...(onMenu ? [{ name: 'actions', label: t.deletion.actions(title) }] : []),
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'actions') {
          onMenu?.();
          return;
        }
        const action = actions.find((item) => item.key === event.nativeEvent.actionName);
        if (action) onAction?.(action.key);
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        minHeight: theme.touch,
        paddingLeft: chatList.gutter - RING / 2,
        paddingRight: chatList.gutter,
        paddingVertical: space.x3,
        backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
      })}
    >
      <View>
        {avatar}
        {badge === undefined ? null : (
          <View
            style={{
              position: 'absolute',
              top: -space.x2,
              right: -space.x3,
              padding: edge.focus,
              borderRadius: radius.sm + edge.focus,
              backgroundColor: theme.layer.canvas.fill,
            }}
          >
            <CountBadge count={badge.count} tone={badge.tone} />
          </View>
        )}
      </View>
      <View
        key={`${theme.scheme}:${theme.fontScale}:${title}`}
        style={{ flex: 1, minWidth: 0, gap: space.x1 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
          }}
        >
          <SourceName name={title} source={source} look={look} />
          {time === '' ? null : (
            <Text variant="meta" tone="subtle" numberOfLines={1} style={{ flexShrink: 0 }}>
              {time}
            </Text>
          )}
        </View>
        {sourceLabel ? (
          <Text variant="meta" tone="subtle" numberOfLines={1}>
            {sourceLabel}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
          <Text
            variant="meta"
            tone={unread ? 'fg' : 'muted'}
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ flex: 1 }}
          >
            {preview}
          </Text>
          <RowStatusGlyph status={status} />
        </View>
      </View>
    </Pressable>
  );
}
