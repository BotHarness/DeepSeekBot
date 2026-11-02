import { Button, HStack, Host, Image, Spacer, Text } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityLabel,
  buttonStyle,
  contentShape,
  disabled as disabledModifier,
  font,
  frame,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import type { CheckmarkRowProps } from './checkmark-row';

export function CheckmarkRow({
  label,
  selected,
  onPress,
  disabled = false,
  testID,
}: CheckmarkRowProps) {
  const theme = useDesignTheme();
  return (
    <Host
      key={theme.scheme}
      colorScheme={theme.scheme}
      matchContents={{ vertical: true }}
      style={{ alignSelf: 'stretch' }}
    >
      <Button
        onPress={onPress}
        {...(testID ? { testID } : {})}
        modifiers={[
          buttonStyle('plain'),
          disabledModifier(disabled),
          accessibilityLabel(label),
          ...(selected ? [accessibilityAddTraits(['isSelected'])] : []),
        ]}
      >
        <HStack
          spacing={space.x4}
          modifiers={[
            padding({ horizontal: space.x5, vertical: space.x3 }),
            frame({ maxWidth: Infinity, minHeight: theme.touch, alignment: 'leading' }),
            contentShape(shapes.rectangle()),
          ]}
        >
          <Text>{label}</Text>
          <Spacer />
          {selected ? (
            <Image
              systemName="checkmark"
              color={theme.color.accent}
              modifiers={[font({ textStyle: 'body', weight: 'semibold' })]}
            />
          ) : null}
        </HStack>
      </Button>
    </Host>
  );
}
