import { Image, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import type { TextVariant } from '../primitives/text';
import { Text } from '../primitives/text';

export function GroupMark({
  avatar,
  size,
  corner,
  fill,
  variant = 'body',
  strong = true,
}: {
  avatar: string | undefined;
  size: number;
  corner: number;
  fill?: string;
  variant?: TextVariant;
  strong?: boolean;
}) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: corner,
        overflow: 'hidden',
        backgroundColor: fill ?? theme.color.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {avatar === undefined ? (
        <Text variant={variant} strong={strong} tone="muted">
          #
        </Text>
      ) : (
        <Image
          testID="group-avatar"
          source={{ uri: avatar }}
          style={{ width: size, height: size }}
        />
      )}
    </View>
  );
}
