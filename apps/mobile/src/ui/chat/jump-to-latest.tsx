import { Pressable, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { badgeCount } from '../primitives/badge-count';
import { Text } from '../primitives/text';
import { ChevronDownIcon } from '../shell/icons';
import { t } from '../strings';

export function JumpToLatest({ unseen, onPress }: { unseen: number; onPress(): void }) {
  const theme = useDesignTheme();
  const layer = theme.layer.raised;
  const badge = theme.type.meta.line;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unseen > 0 ? t.unseenLatest(unseen) : t.jumpToLatest}
      onPress={onPress}
      hitSlop={space.x2}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? layer.pressed : layer.fill,
        borderWidth: edge.hairline,
        borderColor: layer.edge,
        shadowColor: theme.color.fg,
        shadowOpacity: 0.12,
        shadowRadius: radius.lg,
        shadowOffset: { width: 0, height: space.x2 },
        elevation: space.x2,
      })}
    >
      <ChevronDownIcon color={theme.color.fg} size={theme.type.body.line} />
      {unseen > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -space.x2,
            right: -space.x2,
            minWidth: badge,
            height: badge,
            borderRadius: radius.round,
            paddingHorizontal: space.x2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.color.accent,
          }}
        >
          <Text variant="meta" tone="onAccent" strong>
            {badgeCount(unseen)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
