import { View } from 'react-native';
import { Host } from '@expo/ui';
import { Button, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled,
  fixedSize,
  font,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useLiquidGlass } from '../primitives/drawer-material';
import { ComputerScrollPad } from './computer-scroll-pad';
import { t } from '../strings';

export function ComputerPointerControls({
  enabled,
  onClick,
  onScroll,
}: {
  enabled: boolean;
  onClick(button: 'left' | 'right'): void;
  onScroll(axis: 'horizontal' | 'vertical', steps: number): Promise<boolean>;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const mouseButton = (side: 'left' | 'right') => {
    const label = side === 'left' ? t.computerLeftClick : t.computerRightClick;
    return (
      <Host
        matchContents={{ vertical: true }}
        style={{ width: theme.touch * 1.75 }}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
      >
        <Button
          testID={`computer-video-${side}-click`}
          onPress={() => {
            if (enabled) onClick(side);
          }}
          modifiers={[
            buttonStyle(glass ? 'glass' : 'bordered'),
            buttonBorderShape('roundedRectangle'),
            controlSize('regular'),
            tint(theme.color.fg),
            disabled(!enabled),
            accessibilityLabel(label),
            frame({ maxWidth: Infinity, minHeight: theme.touch * 1.5 }),
          ]}
        >
          <Text
            modifiers={[
              font({ textStyle: 'body' }),
              fixedSize({ horizontal: false, vertical: true }),
              frame({ maxWidth: Infinity, minHeight: theme.touch * 1.5 - space.x4 }),
            ]}
          >
            {label}
          </Text>
        </Button>
      </Host>
    );
  };
  return (
    <View
      testID="computer-video-pointer-controls"
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}
    >
      {mouseButton('left')}
      <ComputerScrollPad enabled={enabled} compact={false} onScroll={onScroll} />
      {mouseButton('right')}
    </View>
  );
}
