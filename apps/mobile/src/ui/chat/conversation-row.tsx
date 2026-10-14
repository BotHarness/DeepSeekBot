import { Pressable, View } from 'react-native';

import { BotAvatar } from '../bot-avatar';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { shortTime, titleOf, type Conversation } from './conversations';

const AVATAR = 48;
const RING = 6;

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
  const label = [
    title,
    row.needsYou > 0 ? t.needsYouCount(row.needsYou) : undefined,
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
        backgroundColor: pressed ? theme.color.hover : theme.color.base,
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
          <View
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: radius.md,
              backgroundColor: theme.color.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="title" tone="muted">
              #
            </Text>
          </View>
        </View>
      )}
      <View style={{ flex: 1, gap: space.x1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
          <Text strong numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Text>
          <View style={{ flex: 1 }} />
          <Text variant="meta" tone="subtle">
            {shortTime(row.at, now)}
          </Text>
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
          {row.needsYou > 0 ? <NeedsYouBadge count={row.needsYou} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function NeedsYouBadge({ count }: { count: number }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        minWidth: theme.type.meta.line + space.x2,
        height: theme.type.meta.line + space.x2,
        borderRadius: radius.round,
        paddingHorizontal: space.x2,
        backgroundColor: theme.color.warning,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="meta" strong tone={theme.scheme === 'dark' ? 'base' : 'fg'}>
        {count > 1 ? `! ${count}` : '!'}
      </Text>
    </View>
  );
}
