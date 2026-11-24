import { Pressable, View } from 'react-native';
import type { HostClient } from '@botharness/host-client/client';
import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { BotPortrait } from '../../ui/bot-avatar';
import { pressTint, useDesignTheme } from '../../ui/design/theme';
import { radius, space } from '../../ui/design/tokens';
import { Text } from '../../ui/primitives/text';
import { AssignmentSessionIcon, ChevronRightIcon } from '../../ui/shell/icons';
import { useStrings } from '../../ui/strings';

export function HostSessionListItem({
  row,
  client,
  selected = false,
  onPress,
}: {
  row: HostSessionRow;
  client: HostClient;
  selected?: boolean;
  onPress(): void;
}) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const title = row.title ?? (row.source.kind === 'bot' ? row.source.displayName : t.untitled);
  const source = row.source.kind === 'native' ? t.native : row.source.displayName;
  const state = row.running ? t.running : t.idle;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, source, row.folderName, state].filter(Boolean).join(', ')}
      testID={`host-session-${row.sessionId}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        borderRadius: radius.md,
        padding: space.x3,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        backgroundColor: pressed || selected ? theme.layer.raised.inset : undefined,
      })}
    >
      {row.source.kind === 'bot' ? (
        <BotPortrait
          size={theme.touch}
          bot={{
            slug: row.source.botSlug,
            displayName: row.source.displayName,
            ...(row.source.appearance === undefined ? {} : { appearance: row.source.appearance }),
            ...(row.source.avatarSeed === undefined ? {} : { avatarSeed: row.source.avatarSeed }),
            ...(row.source.avatar === undefined
              ? {}
              : row.source.avatar.startsWith('/')
                ? { avatarSource: client.resource(row.source.avatar) }
                : { avatarUrl: row.source.avatar }),
          }}
        />
      ) : (
        <View
          style={{
            width: theme.touch,
            height: theme.touch,
            borderRadius: radius.md,
            backgroundColor: theme.layer.raised.inset,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AssignmentSessionIcon color={theme.color.muted} size={theme.type.title.line} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
        <Text strong>{title}</Text>
        <Text variant="meta" tone="muted">
          {[row.folderName, state].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <ChevronRightIcon color={theme.color.muted} size={theme.type.meta.line * theme.fontScale} />
    </Pressable>
  );
}
