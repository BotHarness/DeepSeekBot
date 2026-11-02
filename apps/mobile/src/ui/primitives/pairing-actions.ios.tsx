import { Host } from '@expo/ui';
import { Button, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  font,
  frame,
} from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import type { PairingAction, PairingActionsProps } from './pairing-actions';

export function PairingActions({ primary, secondary, details }: PairingActionsProps) {
  const theme = useDesignTheme();
  const action = (item: PairingAction, style: 'borderedProminent' | 'bordered' | 'plain') => (
    <Button
      testID={item.testID}
      onPress={item.onPress}
      modifiers={[
        buttonStyle(style),
        controlSize('large'),
        accessibilityLabel(item.label),
        frame({ minHeight: theme.touch }),
      ]}
    >
      <Text modifiers={[font({ textStyle: 'body' }), frame({ maxWidth: Infinity })]}>
        {item.label}
      </Text>
    </Button>
  );
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
    >
      <VStack spacing={space.x3} modifiers={[frame({ maxWidth: Infinity })]}>
        {primary ? action(primary, 'borderedProminent') : null}
        {action(secondary, 'bordered')}
        {details ? action(details, 'plain') : null}
      </VStack>
    </Host>
  );
}
