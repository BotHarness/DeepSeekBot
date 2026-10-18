import { Pressable, View } from 'react-native';

import { BotAvatar } from '../bot-avatar';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { CountBadge } from '../primitives/count-badge';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { GroupMark } from './group-mark';
import { countBadge, shortTime, titleOf, type Conversation } from './conversations';

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
  const theme = useDesignTheme();
  const title = titleOf(row);
  const busy = row.kind === 'bot' && (row.bot.state === 'thinking' || row.bot.state === 'working');
  const preview =
    row.kind === 'bot'
      ? busy
        ? t.workingPreview
        : (row.bot.preview ?? (row.bot.paused ? t.paused : ''))
      : (row.channel.preview ?? t.members(row.channel.memberCount));
  const badge = countBadge(row);
  const time = shortTime(row.at, now);
  const label = [
    title,
    row.needsYou > 0 ? t.needsYouCount(row.needsYou) : undefined,
    row.unread > 0
      ? row.muted
        ? t.mutedUnread(row.unread)
        : t.unreadCount(row.unread)
      : undefined,
    preview === '' ? undefined : preview,
  ]
    .filter((part) => part !== undefined)
    .join(', ');
  return (
    <Pressable
      onPress={onPress}
      disabled={onPress === undefined}
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
      {row.kind === 'bot' ? (
        <BotAvatar bot={row.bot} size={AVATAR} />
      ) : (
        <View
          style={{
            width: AVATAR + RING,
            height: AVATAR + RING,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <GroupMark
            avatar={row.channel.avatar}
            size={AVATAR}
            corner={radius.md}
            variant="title"
            strong={false}
          />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
          }}
        >
          <Text strong numberOfLines={1} ellipsizeMode="tail" style={{ flex: 1, minWidth: 0 }}>
            {title}
          </Text>
          {time === '' ? null : (
            <Text variant="meta" tone="subtle" numberOfLines={1} style={{ flexShrink: 0 }}>
              {time}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
          <Text
            variant="meta"
            tone={busy ? 'accent' : 'muted'}
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {preview}
          </Text>
          {badge === undefined ? null : <CountBadge count={badge.count} tone={badge.tone} />}
        </View>
      </View>
    </Pressable>
  );
}
