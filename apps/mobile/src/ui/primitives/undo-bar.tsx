import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from './text';

export type UndoNotice = {
  id: number;
  message: string;
  undoLabel?: string;
  undo?(): void;
};

export function UndoBar({
  notice,
  bottom,
  onDone,
}: {
  notice: UndoNotice | undefined;
  bottom: number;
  onDone(id: number): void;
}) {
  const theme = useDesignTheme();
  if (notice === undefined) return null;
  return (
    <Animated.View
      key={notice.id}
      entering={FadeIn}
      exiting={FadeOut}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: space.x5,
        right: space.x5,
        bottom: bottom + space.x3,
      }}
    >
      <View
        testID="undo-bar"
        accessibilityLiveRegion="polite"
        style={{
          minHeight: theme.touch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          paddingLeft: space.x5,
          paddingRight: space.x2,
          paddingVertical: space.x2,
          borderRadius: radius.lg,
          borderWidth: edge.hairline,
          borderColor: theme.layer.raised.edge,
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <Text style={{ flex: 1 }}>{notice.message}</Text>
        {notice.undo === undefined ? null : (
          <Pressable
            testID="undo-bar-undo"
            accessibilityRole="button"
            accessibilityLabel={notice.undoLabel}
            onPress={() => {
              notice.undo?.();
              onDone(notice.id);
            }}
            style={({ pressed }) => ({
              minHeight: theme.touch,
              justifyContent: 'center',
              paddingHorizontal: space.x3,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text tone="accent" strong>
              {notice.undoLabel}
            </Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}
