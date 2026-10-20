import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { fullClientParams, type FullClientTarget } from '../host/full-client';
import { HeaderCircleButton } from './chat/header-chrome';
import { t } from './strings';
import { useDesignTheme } from './design/theme';

export function OpenFullClientButton({
  target,
  bar = false,
  plain = true,
}: {
  target: FullClientTarget;
  bar?: boolean;
  plain?: boolean;
}) {
  const router = useRouter();
  const open = () => router.push({ pathname: '/full-client', params: fullClientParams(target) });
  if (bar)
    return (
      <HeaderCircleButton label={t.openFullClient} onPress={open} plain={plain}>
        <FullClientIcon />
      </HeaderCircleButton>
    );
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t.openFullClient}
      hitSlop={8}
    >
      <FullClientIcon />
    </Pressable>
  );
}

function FullClientIcon() {
  const theme = useDesignTheme();
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4} width={18} height={16} rx={2.5} stroke={theme.color.fg} strokeWidth={1.8} />
      <Path d="M3 9h18" stroke={theme.color.fg} strokeWidth={1.8} />
      <Path
        d="M6 6.5h.01M8.5 6.5h.01"
        stroke={theme.color.fg}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}
