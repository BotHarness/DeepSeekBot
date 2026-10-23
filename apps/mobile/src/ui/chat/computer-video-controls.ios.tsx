import { Host } from '@expo/ui';
import { Button, HStack, Image, Menu, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled,
  font,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { ComponentProps } from 'react';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { haptic } from '../haptics';
import { useLiquidGlass } from '../primitives/drawer-material';
import { t } from '../strings';

type Action = { label: string; disabled: boolean; onPress(): void };

function Control({
  action,
  testID,
  prominent = false,
  symbol,
}: {
  action: Action;
  testID: string;
  prominent?: boolean;
  symbol?: ComponentProps<typeof Image>['systemName'];
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <Button
      testID={testID}
      onPress={() => {
        if (action.disabled) return;
        haptic('selection');
        action.onPress();
      }}
      modifiers={[
        buttonStyle(
          glass
            ? prominent
              ? 'glassProminent'
              : 'glass'
            : prominent
              ? 'borderedProminent'
              : 'bordered',
        ),
        buttonBorderShape(symbol ? 'circle' : 'capsule'),
        controlSize('regular'),
        tint(prominent ? theme.color.accent : theme.color.fg),
        disabled(action.disabled),
        accessibilityLabel(action.label),
        frame({ minHeight: theme.touch }),
      ]}
    >
      {symbol ? (
        <Image
          systemName={symbol}
          size={theme.type.title.line}
          modifiers={[
            frame({ minWidth: theme.touch - space.x4, minHeight: theme.touch - space.x4 }),
          ]}
        />
      ) : (
        <Text
          modifiers={[font({ textStyle: 'body' }), frame({ minHeight: theme.touch - space.x4 })]}
        >
          {action.label}
        </Text>
      )}
    </Button>
  );
}

export function ComputerVideoControls({
  control,
  controlling = false,
  keyboard,
  reset,
  recovery,
}: {
  control: Action;
  controlling?: boolean;
  keyboard?: Action & { open: boolean };
  reset?: () => void;
  recovery?: Action;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const primary = (
    <Control
      testID="computer-video-control"
      action={control}
      symbol={controlling ? 'hand.raised.fill' : 'hand.raised'}
      prominent
    />
  );
  const utilities = (
    <>
      {keyboard ? (
        <Control
          testID="computer-video-keyboard"
          symbol={keyboard.open ? 'keyboard.chevron.compact.down' : 'keyboard'}
          action={keyboard}
        />
      ) : null}
      {reset || recovery ? (
        <Menu
          testID="computer-video-more"
          label={
            <Image
              systemName="ellipsis"
              size={theme.type.title.line}
              modifiers={[
                frame({ minWidth: theme.touch - space.x4, minHeight: theme.touch - space.x4 }),
              ]}
            />
          }
          modifiers={[
            buttonStyle(glass ? 'glass' : 'bordered'),
            buttonBorderShape('circle'),
            tint(theme.color.fg),
            accessibilityLabel(t.computerVideoMore),
            frame({ minHeight: theme.touch }),
          ]}
        >
          {reset ? (
            <Button
              testID="computer-video-reset"
              label={t.computerVideoReset}
              systemImage="arrow.up.left.and.arrow.down.right"
              onPress={() => {
                haptic('selection');
                reset();
              }}
            />
          ) : null}
          {recovery ? (
            <Button
              testID="computer-video-reconnect"
              label={recovery.label}
              systemImage="arrow.clockwise"
              modifiers={[disabled(recovery.disabled)]}
              onPress={() => {
                if (!recovery.disabled) {
                  haptic('selection');
                  recovery.onPress();
                }
              }}
            />
          ) : null}
        </Menu>
      ) : null}
    </>
  );
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
    >
      <HStack spacing={space.x3} modifiers={[frame({ maxWidth: Infinity })]}>
        {primary}
        {utilities}
      </HStack>
    </Host>
  );
}
