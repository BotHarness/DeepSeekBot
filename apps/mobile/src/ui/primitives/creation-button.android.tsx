import type { ComponentProps } from 'react';
import {
  Button as FilledButton,
  FilledTonalButton,
  Host,
  Text,
  TextButton,
} from '@expo/ui/jetpack-compose';
import { defaultMinSize, fillMaxWidth, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useDesignTheme } from '../design/theme';
import type { Button as SharedButton } from './button';

export function Button({
  label,
  onPress,
  tone,
  variant,
  disabled,
  busy,
  testID: id,
}: ComponentProps<typeof SharedButton>) {
  const theme = useDesignTheme();
  const Control =
    variant === 'text' ? TextButton : tone === 'primary' ? FilledButton : FilledTonalButton;
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      ignoreSafeAreaKeyboardInsets
    >
      <Control
        enabled={!disabled && !busy}
        onClick={onPress}
        modifiers={[
          fillMaxWidth(),
          defaultMinSize({ minHeight: theme.touch }),
          ...(id ? [testID(id)] : []),
        ]}
      >
        <Text>{label}</Text>
      </Control>
    </Host>
  );
}
