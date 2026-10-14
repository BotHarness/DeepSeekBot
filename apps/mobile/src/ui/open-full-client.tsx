import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { fullClientParams, type FullClientTarget } from '../host/full-client';
import { t } from './strings';
import { useTheme } from './theme';

export function OpenFullClientButton({ target }: { target: FullClientTarget }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/full-client', params: fullClientParams(target) })}
      accessibilityRole="button"
      accessibilityLabel={t.openFullClient}
      hitSlop={8}
    >
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={4} width={18} height={16} rx={2.5} stroke={theme.accent} strokeWidth={1.8} />
        <Path d="M3 9h18" stroke={theme.accent} strokeWidth={1.8} />
        <Path
          d="M6 6.5h.01M8.5 6.5h.01"
          stroke={theme.accent}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </Svg>
    </Pressable>
  );
}
