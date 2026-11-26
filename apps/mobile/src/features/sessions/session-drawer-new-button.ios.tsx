import { Button, Host, Label } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  dynamicTypeSize,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../../ui/design/theme';
import { useLiquidGlass } from '../../ui/primitives/drawer-material';

export function SessionDrawerNewButton({ label, onPress }: { label: string; onPress(): void }) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <Host
      key={theme.scheme}
      style={{ flex: 1, height: theme.touch }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
    >
      <Button
        onPress={onPress}
        modifiers={[
          buttonStyle(glass ? 'glassProminent' : 'borderedProminent'),
          buttonBorderShape('roundedRectangle', theme.touch / 2),
          controlSize('large'),
          tint(theme.color.accent),
          dynamicTypeSize({ max: 'xxxLarge' }),
          accessibilityLabel(label),
        ]}
      >
        <Label
          title={label}
          systemImage="plus"
          modifiers={[
            font({ textStyle: 'body', weight: 'semibold' }),
            lineLimit(1),
            foregroundStyle(theme.color.onAccent),
            frame({ maxWidth: Infinity, maxHeight: Infinity }),
          ]}
        />
      </Button>
    </Host>
  );
}
