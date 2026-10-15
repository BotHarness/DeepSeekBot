import { useId, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useDesignTheme } from '../design/theme';
import { edge, edgeFade, radius } from '../design/tokens';
import { ChevronLeftIcon } from '../shell/icons';
import { t } from '../strings';

const ICON = 22;

export const systemGlassBar =
  Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;

export function HeaderCircleButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: edge.hairline,
        borderColor: theme.layer.raised.edge,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      {children}
    </Pressable>
  );
}

export function HeaderBackButton({ onPress }: { onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <HeaderCircleButton label={t.back} onPress={onPress}>
      <ChevronLeftIcon color={theme.color.fg} size={ICON} />
    </HeaderCircleButton>
  );
}

export function EdgeFade({ edge: side, height }: { edge: 'top' | 'bottom'; height: number }) {
  const theme = useDesignTheme();
  const id = `fade-${useId().replace(/[^a-z0-9]/giu, '')}`;
  const top = side === 'top';
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height,
        ...(top ? { top: 0 } : { bottom: 0 }),
      }}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1={top ? '0' : '1'} x2="0" y2={top ? '1' : '0'}>
            {edgeFade.stops.map((stop) => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={theme.color.base}
                stopOpacity={stop.opacity}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
