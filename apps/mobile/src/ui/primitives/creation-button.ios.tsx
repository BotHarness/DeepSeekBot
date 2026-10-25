import type { ComponentProps } from 'react';
import { Host } from '@expo/ui';
import { Button as NativeButton, HStack, ProgressView, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  disabled as controlDisabled,
  font,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import type { Button as SharedButton } from './button';

export function Button({
  label,
  onPress,
  tone,
  variant,
  disabled,
  busy,
  testID,
}: ComponentProps<typeof SharedButton>) {
  const theme = useDesignTheme();
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
    >
      <NativeButton
        {...(testID ? { testID } : {})}
        onPress={onPress}
        modifiers={[
          buttonStyle(
            variant === 'text' ? 'plain' : tone === 'primary' ? 'borderedProminent' : 'bordered',
          ),
          controlSize('large'),
          controlDisabled(Boolean(disabled || busy)),
          accessibilityLabel(label),
          frame({ minHeight: theme.touch }),
        ]}
      >
        <HStack>
          {busy ? <ProgressView /> : null}
          <Text modifiers={[font({ textStyle: 'body' }), frame({ maxWidth: Infinity })]}>
            {label}
          </Text>
        </HStack>
      </NativeButton>
    </Host>
  );
}
