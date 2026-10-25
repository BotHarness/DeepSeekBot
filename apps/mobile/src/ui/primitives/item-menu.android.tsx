import { showActionMenu } from './app-dialog';
import type { ItemMenuProps } from './item-menu';
export type { ItemMenuAction } from './item-menu';

export function ItemMenu({ title, actions, children }: ItemMenuProps) {
  return children(() =>
    showActionMenu(
      title,
      actions.map((action) => ({
        text: action.label,
        icon: action.glyph,
        style: action.destructive ? 'destructive' : 'default',
        onPress: action.run,
      })),
    ),
  );
}
