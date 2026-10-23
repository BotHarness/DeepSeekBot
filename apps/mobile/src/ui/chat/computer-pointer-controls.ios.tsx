import { View } from 'react-native';
import { Host } from '@expo/ui';
import { Button, RNHostView } from '@expo/ui/swift-ui';
import Svg, { Path } from 'react-native-svg';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useLiquidGlass } from '../primitives/drawer-material';
import { ComputerScrollPad } from './computer-scroll-pad';
import { t } from '../strings';
import { SystemSymbol } from '../primitives/system-symbol';

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
          <RNHostView matchContents>
            <View
              pointerEvents="none"
              accessible={false}
              style={{
                width: theme.touch - space.x3,
                height: theme.touch * 1.5 - space.x4,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Svg width={theme.type.title.line} height={theme.type.title.line} viewBox="0 0 24 24">
                <Path
                  fill={enabled ? theme.color.fg : theme.color.muted}
                  d={
                    side === 'left'
                      ? 'M11 2C7.6 2.5 5 5.4 5 9v6a7 7 0 0 0 14 0V9c0-3.6-2.6-6.5-6-7v8H7V9c0-2.4 1.7-4.4 4-4.9zM7 12h10v3a5 5 0 0 1-10 0zM7 4h4v6H7z'
                      : 'M11 2C7.6 2.5 5 5.4 5 9v6a7 7 0 0 0 14 0V9c0-3.6-2.6-6.5-6-7v8H7V9c0-2.4 1.7-4.4 4-4.9zM7 12h10v3a5 5 0 0 1-10 0zM13 4h4v6h-4z'
                  }
                />
              </Svg>
            </View>
          </RNHostView>
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
      <ComputerScrollPad enabled={enabled} compact={false} onScroll={onScroll}>
        <View pointerEvents="none">
          <SystemSymbol
            name="arrow.up.and.down.and.arrow.left.and.right"
            size={theme.type.title.line}
            color={enabled ? theme.color.fg : theme.color.muted}
          />
        </View>
      </ComputerScrollPad>
      {mouseButton('right')}
    </View>
  );
}
