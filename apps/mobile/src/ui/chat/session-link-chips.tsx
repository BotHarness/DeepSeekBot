import { Pressable, View } from 'react-native';
import type { WireSessionLink } from '@botharness/host-protocol/wire';
import { edge, radius, rowGlyph, space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { WorkIcon } from '../shell/icons';
import { useStrings } from '../strings';

export function SessionLinkChips({
  links,
  onOpen,
}: {
  links: readonly WireSessionLink[];
  onOpen(link: WireSessionLink): void;
}) {
  const theme = useDesignTheme();
  const t = useStrings().sessionDetail;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.x2 }}>
      {links.map((link) => (
        <Pressable
          key={`${link.kind}:${link.sessionId}`}
          testID={`message-session-${link.sessionId}`}
          accessibilityRole="button"
          accessibilityLabel={t.open(link.title)}
          onPress={() => onOpen(link)}
          android_ripple={{ color: pressTint(theme.color.fg) }}
          style={{
            minHeight: theme.touch,
            maxWidth: '100%',
            justifyContent: 'center',
            borderRadius: radius.round,
            overflow: 'hidden',
          }}
        >
          {({ pressed }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: space.x3,
                paddingVertical: space.x1,
                gap: space.x2,
                borderWidth: edge.hairline,
                borderColor: theme.layer.raised.edge,
                borderRadius: radius.round,
                backgroundColor: pressed ? theme.layer.raised.pressed : theme.color.base,
              }}
            >
              <WorkIcon color={theme.color.muted} size={rowGlyph.size} />
              <Text variant="meta" numberOfLines={1} style={{ flexShrink: 1 }}>
                {link.title}
              </Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}
