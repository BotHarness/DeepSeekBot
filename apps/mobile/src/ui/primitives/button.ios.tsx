import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Host } from '@expo/ui';
import { Button as NativeButton, HStack, Image, ProgressView, Text } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityLabel,
  accessibilityValue,
  buttonStyle,
  contentShape,
  controlSize,
  disabled as controlDisabled,
  font,
  frame,
  multilineTextAlignment,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { controlCase } from '../platform-copy';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useStrings } from '../strings';
import { useLiquidGlass } from './drawer-material';
import type { Button as SharedButton, ButtonSymbol } from './button';

export type { ButtonTone } from '../design/controls';

export const ACTION_SF_SYMBOL = {
  refresh: 'arrow.clockwise',
  check: 'checkmark',
  'shield-check': 'checkmark.shield',
  x: 'xmark',
  archive: 'archivebox',
  plus: 'plus',
  'message-square': 'bubble.left',
  settings: 'gearshape',
  'folder-key': 'folder.badge.gearshape',
  'external-link': 'arrow.up.right.square',
  terminal: 'terminal',
  info: 'info.circle',
  photo: 'photo',
} as const satisfies Record<ButtonSymbol, string>;

function nativeStyle(
  props: Pick<ComponentProps<typeof SharedButton>, 'tone' | 'variant'>,
  glass: boolean,
) {
  if (props.variant === 'text') return 'borderless';
  if (props.tone === 'primary') return glass ? 'glassProminent' : 'borderedProminent';
  return glass ? 'glass' : 'bordered';
}

export function Button({
  label,
  onPress,
  tone = 'secondary',
  disabled = false,
  busy = false,
  variant = 'filled',
  symbol,
  testID,
}: ComponentProps<typeof SharedButton>) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const [height, setHeight] = useState<number>();
  const style = nativeStyle({ tone, variant }, glass);
  const bezel = style !== 'borderless';
  return (
    <Host
      matchContents={{ vertical: true }}
      ignoreSafeArea="keyboard"
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      style={{ alignSelf: 'stretch', flexGrow: 1, maxHeight: height }}
      onLayoutContent={(event) => setHeight(event.nativeEvent.height)}
    >
      <NativeButton
        {...(testID ? { testID } : {})}
        role={tone === 'danger' ? 'destructive' : 'default'}
        onPress={onPress}
        modifiers={[
          buttonStyle(style),
          controlSize('large'),
          ...(tone === 'danger' ? [] : [tint(theme.color.accent)]),
          controlDisabled(disabled || busy),
          accessibilityLabel(label),
          ...(busy ? [accessibilityValue(t.loading)] : []),
        ]}
      >
        <HStack
          spacing={space.x3}
          modifiers={[
            frame({ maxWidth: Infinity, minHeight: bezel ? theme.touch - space.x5 : theme.touch }),
            ...(bezel ? [] : [contentShape(shapes.rectangle())]),
          ]}
        >
          {busy ? (
            <ProgressView />
          ) : symbol ? (
            <Image
              systemName={ACTION_SF_SYMBOL[symbol]}
              modifiers={[font({ textStyle: 'body' }), accessibilityHidden()]}
            />
          ) : null}
          <Text
            modifiers={[
              font({ textStyle: 'body', weight: 'semibold' }),
              multilineTextAlignment('center'),
            ]}
          >
            {controlCase(label)}
          </Text>
        </HStack>
      </NativeButton>
    </Host>
  );
}
