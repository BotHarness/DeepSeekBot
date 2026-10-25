import { Button, ContextMenu, Host, RNHostView } from '@expo/ui/swift-ui';
import { useDesignTheme } from '../design/theme';
import { showActionMenu } from './app-dialog';
import type { ItemMenuProps } from './item-menu';
export type { ItemMenuAction } from './item-menu';

export function ItemMenu({ title, actions, children }: ItemMenuProps) {
  const theme = useDesignTheme();
  return (
    <Host matchContents={{ vertical: true }} colorScheme={theme.scheme}>
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView matchContents>
            {children(
              () =>
                showActionMenu(
                  title,
                  actions.map((action) => ({
                    text: action.label,
                    icon: action.glyph,
                    style: action.destructive ? 'destructive' : 'default',
                    onPress: action.run,
                  })),
                ),
              true,
            )}
          </RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Items>
          {actions.map((action) => (
            <Button
              key={action.key}
              label={action.label}
              {...(action.destructive ? { role: 'destructive' } : {})}
              onPress={action.run}
            />
          ))}
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}
