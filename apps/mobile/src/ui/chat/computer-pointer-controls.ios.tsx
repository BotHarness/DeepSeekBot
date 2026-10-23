import { View } from 'react-native';
import { Host } from '@expo/ui';
import { Button, RNHostView } from '@expo/ui/swift-ui';
import Svg, { Path, Rect } from 'react-native-svg';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled,
  dynamicTypeSize,
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
            dynamicTypeSize('large'),
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
                width: theme.touch + space.x3,
                height: theme.touch * 1.5 - space.x4,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Svg
                width={theme.type.title.line}
                height={theme.type.title.line}
                viewBox="0 0 24 24"
                fill="none"
              >
                <Path
                  fill={enabled ? theme.color.fg : theme.color.muted}
                  d={side === 'left' ? 'M12 2a7 7 0 0 0-7 7v1h7Z' : 'M12 2a7 7 0 0 1 7 7v1h-7Z'}
                />
                <Rect
                  x="5"
                  y="2"
                  width="14"
                  height="20"
                  rx="7"
                  stroke={enabled ? theme.color.fg : theme.color.muted}
                  strokeWidth="1.8"
                />
                <Path
                  d="M12 2v8M5 10h14"
                  stroke={enabled ? theme.color.fg : theme.color.muted}
                  strokeWidth="1.8"
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
