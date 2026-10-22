import { Circle, Host, RoundedRectangle } from '@expo/ui/swift-ui';
import { accessibilityHidden, foregroundStyle, glassEffect } from '@expo/ui/swift-ui/modifiers';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { pressTint, useDesignTheme, type DesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useLiquidGlass } from '../primitives/drawer-material';

export function composerPrimary(theme: DesignTheme): { fill: string; ink: string } {
  return { fill: theme.color.fg, ink: theme.color.base };
}

export function composerBar(theme: DesignTheme): number {
  return theme.touch - space.x2;
}

export const micAlwaysFilled = true;

export const rippleFeedback = false;

function Glass({ cornerRadius }: { cornerRadius?: number }) {
  const theme = useDesignTheme();
  return (
    <Host
      key={theme.scheme}
      style={StyleSheet.absoluteFill}
      colorScheme={theme.scheme}
      pointerEvents="none"
    >
      {cornerRadius === undefined ? (
        <Circle
          modifiers={[
            foregroundStyle('transparent'),
            glassEffect({
              glass: { variant: 'regular', tint: theme.color.surface },
              shape: 'circle',
            }),
            accessibilityHidden(),
          ]}
        />
      ) : (
        <RoundedRectangle
          cornerRadius={cornerRadius}
          modifiers={[
            foregroundStyle('transparent'),
            glassEffect({
              glass: { variant: 'regular', tint: theme.color.surface },
              shape: 'roundedRectangle',
              cornerRadius,
            }),
            accessibilityHidden(),
          ]}
        />
      )}
    </Host>
  );
}

export function ComposerCircleButton({
  label,
  testID,
  size,
  onPress,
  children,
}: {
  label: string;
  testID?: string;
  size: number;
  onPress(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      hitSlop={Math.max(0, (theme.touch - size) / 2)}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        ...(glass
          ? { backgroundColor: pressed ? pressTint(theme.color.fg) : 'transparent' }
          : {
              borderWidth: edge.hairline,
              borderColor: theme.color.borderStrong,
              backgroundColor: pressed ? theme.layer.raised.pressed : theme.color.surface,
            }),
      })}
    >
      {glass ? <Glass /> : null}
      {children}
    </Pressable>
  );
}

export function ComposerFieldMaterial({ cornerRadius }: { cornerRadius: number }) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        glass
          ? undefined
          : {
              borderRadius: cornerRadius,
              borderWidth: edge.hairline,
              borderColor: theme.color.borderStrong,
              backgroundColor: theme.color.surface,
            },
      ]}
    >
      {glass ? <Glass cornerRadius={cornerRadius} /> : null}
    </View>
  );
}
