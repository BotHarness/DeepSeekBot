import { Image } from 'expo-image';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import { Text } from '../primitives/text';
import { humanInitial } from './human-avatar-initial';
import { PersonIcon } from './icons';

export function AccountAvatar({
  uri,
  name,
  size,
}: {
  uri: string | null | undefined;
  name: string | undefined;
  size: number;
}) {
  const theme = useDesignTheme();
  const initial = humanInitial(name);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.round,
        overflow: 'hidden',
        backgroundColor: theme.layer.raised.fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {typeof uri === 'string' ? (
        <Image
          source={{ uri }}
          accessibilityIgnoresInvertColors
          style={{ width: size, height: size }}
          contentFit="cover"
        />
      ) : initial === undefined ? (
        <PersonIcon color={theme.color.fg} size={size / 2} />
      ) : (
        <Text allowFontScaling={false} strong variant={size > theme.touch ? 'display' : 'body'}>
          {initial}
        </Text>
      )}
    </View>
  );
}
