import type { ReactNode } from 'react';
import { SourceName } from './source-name';
import { Pressable, View } from 'react-native';

import { BotAvatar } from '../bot-avatar';
import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { CountBadge } from '../primitives/count-badge';
import { Text } from '../primitives/text';
import { t } from '../strings';
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

const AVATAR = 48;
const RING = 6;

export const AVATAR_EDGE = space.x5 + RING / 2;

export function ConversationRow({
  row,
  now,
  onPress,
}: {
  row: Conversation;
  now: Date;
  onPress?: () => void;
}) {
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
  const label = rowLabel(row, title, status, preview);
  return (
    <ConversationRowFrame
      testID={`conversation-row-${row.key}`}
      title={title}
      source="computer"
      label={label}
      preview={preview}
      time={time}
      status={status}
      unread={row.unread > 0 && !row.muted}
      badge={badge}
      onPress={onPress}
      avatar={
        row.kind === 'bot' ? (
          <AvatarSlot>
            <BotAvatar bot={row.bot} size={AVATAR} corner={radius.md} ring={false} />
          </AvatarSlot>
        ) : (
          <ConversationGroupAvatar avatar={row.channel.avatar} />
        )
      }
    />
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
  source,
  label,
  preview,
  time = '',
  status = 'none',
  unread = false,
  badge,
  avatar,
  onPress,
  disabled = false,
  testID,
}: {
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
  disabled?: boolean;
  testID?: string;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || onPress === undefined}
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        minHeight: theme.touch,
        paddingHorizontal: space.x5,
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
      <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
          }}
        >
          <SourceName name={title} source={source} />
          {time === '' ? null : (
            <Text variant="meta" tone="subtle" numberOfLines={1} style={{ flexShrink: 0 }}>
              {time}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
          <Text variant="meta" tone={unread ? 'fg' : 'muted'} numberOfLines={1} style={{ flex: 1 }}>
            {preview}
          </Text>
          <RowStatusGlyph status={status} />
        </View>
      </View>
    </Pressable>
  );
}
