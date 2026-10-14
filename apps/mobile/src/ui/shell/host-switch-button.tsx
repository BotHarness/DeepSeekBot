import { useRouter } from 'expo-router';
import { Platform, Pressable } from 'react-native';

import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function HostSwitchButton({ hostName }: { hostName: string }) {
  const theme = useDesignTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/hosts')}
      accessibilityRole="button"
      accessibilityLabel={t.switchComputer(hostName)}
      hitSlop={8}
      style={({ pressed }) => ({
        width: theme.touch - 12,
        height: theme.touch - 12,
        borderRadius: radius.sm,
        marginLeft: Platform.OS === 'web' ? space.x5 : 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.accent,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text tone="onAccent" strong>
        {Array.from(hostName.trim())[0]?.toUpperCase() ?? '?'}
      </Text>
    </Pressable>
  );
}
