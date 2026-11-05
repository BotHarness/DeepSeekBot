import { Button, HStack, Host, Image } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  glassEffect,
} from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import type { ChatHeaderActionsProps } from './chat-header-actions';

const symbols = { call: 'phone', more: 'ellipsis' } as const;

export function ChatHeaderActions({ actions }: ChatHeaderActionsProps) {
  const theme = useDesignTheme();
  return (
    <Host key={theme.scheme} colorScheme={theme.scheme} matchContents>
      <HStack
        spacing={0}
        modifiers={[
          glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' }),
          frame({ height: theme.touch }),
        ]}
      >
        {actions.map((action) => (
          <Button
            key={action.testID}
            onPress={action.onPress}
            modifiers={[
              buttonStyle('plain'),
              accessibilityLabel(action.label),
              accessibilityIdentifier(action.testID),
            ]}
          >
            <Image
              systemName={symbols[action.icon]}
              modifiers={[
                font({ textStyle: 'body', weight: 'medium' }),
                foregroundStyle(theme.color.fg),
                frame({ width: theme.touch, height: theme.touch }),
              ]}
            />
          </Button>
        ))}
      </HStack>
    </Host>
  );
}
