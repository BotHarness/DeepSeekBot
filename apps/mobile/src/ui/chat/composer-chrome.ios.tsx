import { Circle, Host, RoundedRectangle } from '@expo/ui/swift-ui';
import { accessibilityHidden, foregroundStyle, glassEffect } from '@expo/ui/swift-ui/modifiers';
import { NativeComposerButton } from './native-composer-button.ios';
import type { ComposerSymbol } from './composer-symbol';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDesignTheme, type DesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { useLiquidGlass } from '../primitives/drawer-material';

export function composerPrimary(theme: DesignTheme): { fill: string; ink: string } {
  return { fill: theme.color.fg, ink: theme.color.base };
}

export function composerBar(theme: DesignTheme): number {
  return theme.touch + space.x3;
}

export function composerControl(theme: DesignTheme): number {
  return theme.touch;
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
  embedded = false,
  onPress,
  symbol,
}: {
  label: string;
  testID?: string;
  size: number;
  embedded?: boolean;
  onPress(): void;
  symbol: ComposerSymbol;
  children: ReactNode;
}) {
  return (
    <NativeComposerButton
      label={label}
      {...(testID === undefined ? {} : { testID })}
      size={size}
      embedded={embedded}
      onPress={onPress}
      symbol={symbol}
    />
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
