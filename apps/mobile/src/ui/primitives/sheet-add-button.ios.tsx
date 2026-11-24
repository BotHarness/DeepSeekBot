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
  const modifiers = [
    buttonStyle(glass ? 'glassProminent' : 'borderedProminent'),
    buttonBorderShape('circle'),
    tint(theme.color.accent),
    accessibilityLabel(label),
    ...(testID === undefined ? [] : [accessibilityIdentifier(testID)]),
    frame({ minWidth: theme.touch, minHeight: theme.touch }),
  ];
  const plus = <Image systemName="plus" size={theme.type.title.line} />;
  return (
    <Host matchContents colorScheme={theme.scheme} seedColor={theme.color.accent}>
      {actions.length === 1 ? (
        <Button onPress={actions[0]!.run} modifiers={modifiers}>
          {plus}
        </Button>
      ) : (
        <Menu label={plus} modifiers={modifiers}>
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
