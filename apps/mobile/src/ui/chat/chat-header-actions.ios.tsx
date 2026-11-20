import { Host } from '@expo/ui';
import { Button, HStack, Image } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  contentShape,
  foregroundStyle,
  frame,
  glassEffect,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { headerContentScale, headerControlHeight } from './native-header';
import type { ChatHeaderActionsProps } from './chat-header-actions';

const symbols = { back: 'chevron.left', call: 'phone', more: 'ellipsis' } as const;

export function ChatHeaderActions(props: ChatHeaderActionsProps) {
  const actions = 'back' in props ? [{ ...props.back, icon: 'back' as const }] : props.actions;
  const theme = useDesignTheme();
  const height = headerControlHeight(theme);
  const symbolSize = theme.type.body.line * headerContentScale(theme);
  return (
    <Host colorScheme={theme.scheme} style={{ width: height * actions.length, height }}>
      <HStack
        spacing={0}
        modifiers={[
          glassEffect({
            glass: { variant: 'regular', interactive: true },
            shape: actions.length === 1 ? 'circle' : 'capsule',
          }),
        ]}
      >
        {actions.map((action) => (
          <Button
            key={action.testID}
            testID={action.testID}
            onPress={action.onPress}
            modifiers={[
              buttonStyle('plain'),
              accessibilityLabel(action.label),
              foregroundStyle(theme.color.fg),
            ]}
          >
            <Image
              systemName={symbols[action.icon]}
              size={symbolSize}
              modifiers={[
                frame({ width: height, height, alignment: 'center' }),
                contentShape(shapes.rectangle()),
              ]}
            />
          </Button>
        ))}
      </HStack>
    </Host>
  );
}
