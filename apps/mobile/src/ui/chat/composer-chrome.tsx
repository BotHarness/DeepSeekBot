import type { ComposerSymbol } from './composer-symbol';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { pressTint, useDesignTheme, type DesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';

export function composerPrimary(theme: DesignTheme): { fill: string; ink: string } {
  return { fill: theme.color.accent, ink: theme.color.onAccent };
}

export function composerBar(theme: DesignTheme): number {
  return Platform.OS === 'android' ? theme.touch + space.x3 : theme.touch;
}

export function composerControl(theme: DesignTheme): number {
  return Platform.OS === 'android' ? theme.touch : theme.touch - space.x4;
}

export const micAlwaysFilled = false;

export const rippleFeedback = true;

export function ComposerCircleButton({
  label,
  testID,
  size,
  embedded = false,
  onPress,
  children,
}: {
  label: string;
  testID?: string;
  size: number;
  embedded?: boolean;
  onPress(): void;
  symbol: ComposerSymbol;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg), foreground: true }}
      style={{
        width: size,
        height: size,
        borderRadius: radius.round,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: embedded ? theme.layer.raised.inset : theme.layer.raised.fill,
      }}
    >
      {children}
    </Pressable>
  );
}

export function ComposerFieldMaterial({ cornerRadius }: { cornerRadius: number }) {
  const theme = useDesignTheme();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: cornerRadius, backgroundColor: theme.layer.raised.fill },
      ]}
    />
  );
}
