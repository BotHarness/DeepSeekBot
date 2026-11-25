import { Host } from '@expo/ui';
import { Button } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../../ui/design/theme';
import { useLiquidGlass } from '../../ui/primitives/drawer-material';

export function SessionDrawerNewButton({ label, onPress }: { label: string; onPress(): void }) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <Host key={theme.scheme} matchContents colorScheme={theme.scheme}>
      <Button
        label={label}
        systemImage="plus"
        onPress={onPress}
        modifiers={[
          buttonStyle(glass ? 'glassProminent' : 'borderedProminent'),
          buttonBorderShape('capsule'),
          controlSize('large'),
          tint(theme.color.fg),
          foregroundStyle(theme.color.base),
          font({ textStyle: 'body', weight: 'semibold' }),
          accessibilityLabel(label),
        ]}
      />
    </Host>
  );
}
