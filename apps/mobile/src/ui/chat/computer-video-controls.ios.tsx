import { Host } from '@expo/ui';
import { Button, HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled,
  font,
  frame,
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
            frame({ minWidth: theme.touch - space.x5, minHeight: theme.touch - space.x5 }),
          ]}
        />
      ) : (
        <Text modifiers={[font({ textStyle: 'body' })]}>{action.label}</Text>
      )}
    </Button>
  );
}

export function ComputerVideoControls({
  control,
  pointer,
  reset,
  recovery,
}: {
  control: Action;
  pointer?: { disabled: boolean; left(): void; right(): void };
  reset?: () => void;
  recovery?: Action;
}) {
  const theme = useDesignTheme();
  const primary = <Control testID="computer-video-control" action={control} prominent />;
  const clicks = pointer ? (
    <>
      <Control
        testID="computer-video-click"
        action={{ label: t.computerLeftClick, disabled: pointer.disabled, onPress: pointer.left }}
      />
      <Control
        testID="computer-video-right-click"
        action={{ label: t.computerRightClick, disabled: pointer.disabled, onPress: pointer.right }}
      />
    </>
  ) : null;
  const utilities = (
    <>
      {reset ? (
        <Control
          testID="computer-video-reset"
          symbol="arrow.up.left.and.arrow.down.right"
          action={{ label: t.computerVideoReset, disabled: false, onPress: reset }}
        />
      ) : null}
      {recovery ? (
        <Control testID="computer-video-reconnect" symbol="arrow.clockwise" action={recovery} />
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
        <HStack spacing={space.x3} modifiers={[frame({ maxWidth: Infinity })]}>
          {primary}
          {clicks}
          {utilities}
        </HStack>
      )}
    </Host>
  );
}
