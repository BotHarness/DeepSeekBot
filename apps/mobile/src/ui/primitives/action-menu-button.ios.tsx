import { Button, Host, Image, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
} from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import type { MenuAction, ActionMenuButtonProps } from './action-menu-button';

export type { MenuAction } from './action-menu-button';

const SYMBOL = {
  settings: 'paintbrush',
  computer: 'desktopcomputer',
  close: 'xmark.circle',
  person: 'person.crop.circle',
  remove: 'person.badge.minus',
  pin: 'pin',
  mute: 'bell.slash',
  check: 'checkmark',
  folder: 'folder',
  chat: 'bubble.left',
  share: 'square.and.arrow.up',
} as const satisfies Record<MenuAction['icon'], string>;

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
        ]}
      >
        {actions.map((action) => (
          <Button
            key={action.label}
            label={action.label}
            systemImage={SYMBOL[action.icon]}
            {...(action.destructive === true ? { role: 'destructive' as const } : {})}
            onPress={action.run}
          />
        ))}
      </Menu>
    </Host>
  );
}
