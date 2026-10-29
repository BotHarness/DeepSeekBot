import { Button, Host, Image, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';

import { controlCase } from '../platform-copy';
import { useDesignTheme } from '../design/theme';
import type { ActionMenuButtonProps } from './action-menu-button';
import { MENU_SYMBOL as SYMBOL } from './menu-symbols';

export type { MenuAction } from './action-menu-button';

export function ActionMenuButton({
  label,
  actions,
  testID = 'action-menu-trigger',
  disabled = false,
}: ActionMenuButtonProps) {
  const theme = useDesignTheme();
  return (
    <Host
      key={theme.scheme}
      colorScheme={theme.scheme}
      style={{ width: theme.touch, height: theme.touch }}
    >
      <Menu
        label={
          <Image
            systemName="ellipsis"
            modifiers={[
              font({ textStyle: 'title3' }),
              foregroundStyle(theme.color.muted),
              frame({ width: theme.touch, height: theme.touch }),
            ]}
          />
        }
        modifiers={[
          accessibilityLabel(label),
          accessibilityIdentifier(testID),
          disabledModifier(disabled),
          tint(theme.color.fg),
        ]}
      >
        {actions.map((action) => (
          <Button
            key={action.label}
            label={controlCase(action.label)}
            systemImage={SYMBOL[action.icon]}
            {...(action.destructive === true ? { role: 'destructive' as const } : {})}
            modifiers={[
              foregroundStyle(action.destructive === true ? theme.color.danger : theme.color.fg),
            ]}
            onPress={action.run}
          />
        ))}
      </Menu>
    </Host>
  );
}
