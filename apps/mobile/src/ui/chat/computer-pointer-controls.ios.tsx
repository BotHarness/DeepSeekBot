import { View } from 'react-native';
import { Host } from '@expo/ui';
import { Button, Image } from '@expo/ui/swift-ui';
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
          <Image
            systemName={side === 'left' ? 'cursorarrow.click' : 'filemenu.and.cursorarrow'}
            size={theme.type.title.line}
            modifiers={[frame({ maxWidth: Infinity, minHeight: theme.touch * 1.5 - space.x4 })]}
          />
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
