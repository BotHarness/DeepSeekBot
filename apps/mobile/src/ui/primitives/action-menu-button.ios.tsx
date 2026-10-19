import { Button, Host, Image, Menu } from '@expo/ui/swift-ui';
import { accessibilityLabel, font, foregroundStyle, frame } from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import type { MenuAction, ActionMenuButtonProps } from './action-menu-button';

export type { MenuAction } from './action-menu-button';

const SYMBOL = {
  settings: 'paintbrush',
  computer: 'desktopcomputer',
  close: 'xmark.circle',
  person: 'person.crop.circle',
  remove: 'person.badge.minus',
} as const satisfies Record<MenuAction['icon'], string>;

export function ActionMenuButton({ label, actions }: ActionMenuButtonProps) {
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
        modifiers={[accessibilityLabel(label)]}
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
