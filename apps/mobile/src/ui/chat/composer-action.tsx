import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { composerControl, composerPrimary, rippleFeedback } from './composer-chrome';
import type { ComposerSymbol } from './composer-symbol';

export function ComposerActionButton({
  label,
  filled,
  onPress,
  testID,
  children,
}: {
  label: string;
  filled: boolean;
  onPress(): void;
  testID?: string;
  symbol: ComposerSymbol;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const size = composerControl(theme);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={space.x2}
      android_ripple={
        rippleFeedback
          ? {
              color: pressTint(filled ? composerPrimary(theme).ink : theme.color.fg),
              borderless: true,
              radius: size / 2,
            }
          : undefined
      }
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled
          ? composerPrimary(theme).fill
          : pressed && !rippleFeedback
            ? pressTint(theme.color.fg)
            : undefined,
        opacity: filled && pressed && !rippleFeedback ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
