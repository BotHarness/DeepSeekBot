import { Pressable, View } from 'react-native';
import type { WireSessionLink } from '@botharness/host-protocol/wire';
import { radius, rowGlyph, space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { WorkIcon } from '../shell/icons';
import { useStrings } from '../strings';

export function SessionLinkChips({
  links,
  kind,
  onOpen,
}: {
  links: readonly WireSessionLink[];
  kind: WireSessionLink['kind'];
  onOpen(link: WireSessionLink): void;
}) {
  const theme = useDesignTheme();
  const t = useStrings().sessionDetail;
  const shown = links.filter((link) => link.kind === kind);
  if (shown.length === 0) return null;
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2, paddingHorizontal: space.x5 }}
    >
      {shown.map((link) => (
        <Pressable
          key={link.sessionId}
          testID={`message-session-${link.sessionId}`}
          accessibilityRole="button"
          accessibilityLabel={t.open(link.title)}
          onPress={() => onOpen(link)}
          android_ripple={{ color: pressTint(theme.color.fg) }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: theme.touch,
            paddingHorizontal: space.x3,
            gap: space.x2,
            borderRadius: radius.round,
            backgroundColor: pressed ? theme.layer.raised.inset : theme.layer.raised.fill,
            overflow: 'hidden',
          })}
        >
          <WorkIcon color={theme.color.muted} size={rowGlyph.size} />
          <Text variant="meta" numberOfLines={1} style={{ flexShrink: 1 }}>
            {link.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
