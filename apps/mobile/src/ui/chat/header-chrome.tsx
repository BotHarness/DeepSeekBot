import { useId, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { frosted, pressTint, useDesignTheme, type DesignTheme } from '../design/theme';
import { edge, edgeFade, radius, space } from '../design/tokens';
import { DrawerMaterial, EdgeMaterial, useLiquidGlass } from '../primitives/drawer-material';
import { ChevronLeftIcon } from '../shell/icons';
import { t } from '../strings';

const ICON = 22;

export function useChatHeaderHeight(): number {
  const theme = useDesignTheme();
  return (
    useSafeAreaInsets().top +
    Math.max(theme.touch, theme.type.body.line * theme.fontScale + space.x3) +
    space.x2 * 2
  );
}

export function ChatHeader({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top + space.x2,
        paddingBottom: space.x2,
        paddingHorizontal: space.x4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
      }}
    >
      <View style={{ width: theme.touch }}>{left}</View>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center' }}>
        {center}
      </View>
      <View style={{ width: theme.touch }}>{right}</View>
    </View>
  );
}

export function HeaderCircleButton({
  label,
  onPress,
  children,
  selected = false,
}: {
  label: string;
  onPress(): void;
  children: ReactNode;
  selected?: boolean;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        ...headerGlassFill(theme, glass, pressed),
      })}
    >
      {glass ? <DrawerMaterial /> : null}
      {children}
    </Pressable>
  );
}

export function headerGlassFill(theme: DesignTheme, glass: boolean, pressed: boolean) {
  if (glass)
    return {
      borderWidth: 0,
      backgroundColor: pressed ? pressTint(theme.color.fg) : 'transparent',
    };
  return {
    borderWidth: edge.hairline,
    borderColor: theme.layer.raised.edge,
    backgroundColor: pressed ? theme.layer.raised.pressed : frosted(theme.layer.raised.fill),
  };
}

export function HeaderBackButton({ onPress }: { onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <HeaderCircleButton label={t.back} onPress={onPress}>
      <ChevronLeftIcon color={theme.color.fg} size={ICON} />
    </HeaderCircleButton>
  );
}

export function EdgeFade({
  edge: side,
  height,
  fade,
}: {
  edge: 'top' | 'bottom';
  height: number;
  fade: number;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
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
      {glass ? (
        <EdgeMaterial edge={side} solid={height > fade ? (height - fade) / height : 0} />
      ) : null}
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0%" y1={top ? '0%' : '100%'} x2="0%" y2={top ? '100%' : '0%'}>
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
