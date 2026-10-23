import { Host } from '@expo/ui';
import { Button, HStack, Image, Menu, RNHostView, Text, VStack } from '@expo/ui/swift-ui';
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
import { View } from 'react-native';
import { ComputerScrollPad } from './computer-scroll-pad';
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
  pointer,
  keyboard,
  reset,
  recovery,
}: {
  control: Action;
  pointer?: {
    disabled: boolean;
    left(): void;
    right(): void;
    scroll(axis: 'horizontal' | 'vertical', steps: number): void;
  };
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
      symbol={pointer ? 'hand.raised.fill' : 'hand.raised'}
      prominent
    />
  );
  const clicks = pointer ? (
    <>
      <Control
        testID="computer-video-click"
        action={{ label: t.computerLeftClick, disabled: pointer.disabled, onPress: pointer.left }}
      />
      <RNHostView matchContents>
        <View style={{ width: theme.touch * 1.25, height: theme.touch }}>
          <ComputerScrollPad
            enabled={!pointer.disabled}
            compact
            toolbar
            onScroll={pointer.scroll}
          />
        </View>
      </RNHostView>
      <Control
        testID="computer-video-right-click"
        action={{ label: t.computerRightClick, disabled: pointer.disabled, onPress: pointer.right }}
      />
    </>
  ) : null;
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
      {theme.largeText ? (
        <VStack spacing={space.x3} modifiers={[frame({ maxWidth: Infinity })]}>
          <HStack spacing={space.x3}>
            {primary}
            {utilities}
          </HStack>
          {clicks ? <HStack spacing={space.x3}>{clicks}</HStack> : null}
        </VStack>
      ) : (
        <HStack spacing={space.x2} modifiers={[frame({ maxWidth: Infinity })]}>
          {primary}
          {clicks}
          {utilities}
        </HStack>
      )}
    </Host>
  );
}
