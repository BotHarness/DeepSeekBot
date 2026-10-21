import { useId, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { frosted, pressTint, useDesignTheme, type DesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { DrawerMaterial, EdgeMaterial, useLiquidGlass } from '../primitives/drawer-material';
import { BackIcon } from '../shell/back-icon';
import { t } from '../strings';
import { edgeFadeStops } from './edge-fade';

const ICON = 22;

export function useChatHeaderHeight(): number {
  const theme = useDesignTheme();
  return (
    useSafeAreaInsets().top +
    Math.max(theme.touch, theme.type.body.line * theme.fontScale + space.x3) +
    space.x2 * 2
  );
}

export function HeaderCircleButton({
  label,
  onPress,
  children,
  selected = false,
  plain = false,
}: {
  label: string;
  onPress(): void;
  children: ReactNode;
  selected?: boolean;
  plain?: boolean;
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
        ...(plain
          ? { backgroundColor: pressed ? theme.layer.raised.pressed : undefined }
          : headerGlassFill(theme, glass, pressed)),
      })}
    >
      {glass && !plain ? <DrawerMaterial /> : null}
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

export function titleChipFill(theme: DesignTheme, pressed: boolean) {
  if (Platform.OS === 'android') return headerGlassFill(theme, false, pressed);
  return { backgroundColor: pressed ? theme.layer.raised.pressed : undefined };
}

export function HeaderBackButton({ onPress, plain }: { onPress(): void; plain?: boolean }) {
  const theme = useDesignTheme();
  return (
    <HeaderCircleButton label={t.back} onPress={onPress} plain={plain === true}>
      <BackIcon color={theme.color.fg} size={ICON} />
    </HeaderCircleButton>
  );
}

export function EdgeFade({
  edge: side,
  height,
  cover = 0,
  solid,
  color,
}: {
  edge: 'top' | 'bottom';
  height: number;
  cover?: number;
  solid?: number;
  color?: string;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const id = `fade-${useId().replace(/[^a-z0-9]/giu, '')}`;
  const top = side === 'top';
  const insets = useSafeAreaInsets();
  const stops = edgeFadeStops(height, cover, solid ?? (top ? insets.top : insets.bottom));
  const span = Math.ceil(height) + 1;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height: span,
        ...(top ? { top: -1 } : { bottom: -1 }),
      }}
    >
      {glass && cover === 0 ? (
        <EdgeMaterial edge={side} />
      ) : (
        <Svg width="100%" height={span} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              {(top
                ? stops
                : stops.map((stop) => ({ ...stop, offset: 1 - stop.offset })).reverse()
              ).map((stop) => (
                <Stop
                  key={stop.offset}
                  offset={stop.offset}
                  stopColor={color ?? theme.color.base}
                  stopOpacity={stop.opacity}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height={span} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}
