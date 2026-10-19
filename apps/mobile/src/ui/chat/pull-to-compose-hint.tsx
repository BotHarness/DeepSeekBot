import { View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { KeyboardIcon } from '../shell/icons';
import { t } from '../strings';

export function PullToComposeHint({
  progress,
  ready,
  bottom,
}: {
  progress: SharedValue<number>;
  ready: boolean;
  bottom: number;
}) {
  const theme = useDesignTheme();
  const layer = theme.layer.raised;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.25, 1], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(progress.value, [0.25, 1], [0.9, 1], 'clamp') }],
  }));
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ position: 'absolute', bottom, left: 0, right: 0, alignItems: 'center' }}
    >
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x2,
            paddingHorizontal: space.x4,
            paddingVertical: space.x2,
            borderRadius: radius.round,
            backgroundColor: layer.fill,
            borderWidth: edge.hairline,
            borderColor: layer.edge,
          },
          style,
        ]}
      >
        <KeyboardIcon
          color={ready ? theme.color.fg : theme.color.muted}
          size={theme.type.meta.line}
        />
        <Text variant="meta" tone={ready ? 'fg' : 'muted'} strong={ready}>
          {ready ? t.releaseToCompose : t.pullToCompose}
        </Text>
      </Animated.View>
    </View>
  );
}
