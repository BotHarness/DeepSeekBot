import { Host } from '@expo/ui';
import { Button, Image, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { controlCase } from '../platform-copy';
import { useLiquidGlass } from './drawer-material';
import { MENU_SYMBOL } from './menu-symbols';
import type { SheetAddButtonProps } from './sheet-add-button';

export function SheetAddButton({ label, actions, testID }: SheetAddButtonProps) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const shape = [
    buttonStyle(glass ? 'glassProminent' : 'borderedProminent'),
    buttonBorderShape('circle'),
    tint(theme.color.accent),
    accessibilityLabel(label),
    ...(testID === undefined ? [] : [accessibilityIdentifier(testID)]),
  ];
  const plus = (
    <Image
      systemName="plus"
      size={theme.type.title.line}
      modifiers={[frame({ minWidth: theme.touch, minHeight: theme.touch })]}
    />
  );
  return (
    <Host matchContents key={theme.scheme} colorScheme={theme.scheme}>
      {actions.length === 1 ? (
        <Button onPress={actions[0]!.run} modifiers={shape}>
          {plus}
        </Button>
      ) : (
        <Menu label={plus} modifiers={shape}>
          {actions.map((action) => (
            <Button
              key={action.label}
              label={controlCase(action.label)}
              systemImage={MENU_SYMBOL[action.icon]}
              modifiers={[foregroundStyle(theme.color.fg)]}
              onPress={action.run}
            />
          ))}
        </Menu>
      )}
    </Host>
  );
}
