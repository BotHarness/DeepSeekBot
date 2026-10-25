import type { LinkMenuActionProps } from 'expo-router';
import type { MenuGlyph } from './menu-icon';
import { useState, type ReactElement } from 'react';
import { ScrollView } from 'react-native';
import { Sheet } from '../chat/sheet';
import { space } from '../design/tokens';
import { Button } from './button';

export type ItemMenuAction = {
  key: string;
  label: string;
  glyph: MenuGlyph;
  icon?: NonNullable<LinkMenuActionProps['icon']>;
  destructive?: boolean;
  run(): void;
};
export type ItemMenuProps = {
  title: string;
  actions: readonly ItemMenuAction[];
  children(open: () => void, nativeContextMenu?: boolean): ReactElement;
};

export function ItemMenu({ title, actions, children }: ItemMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {children(() => setOpen(true))}
      {open ? (
        <Sheet visible title={title} label={title} onClose={() => setOpen(false)}>
          <ScrollView contentContainerStyle={{ padding: space.x5, gap: space.x2 }}>
            {actions.map((action) => (
              <Button
                key={action.key}
                testID={`menu-${action.key}`}
                label={action.label}
                variant="text"
                tone={action.destructive ? 'danger' : 'secondary'}
                onPress={() => {
                  setOpen(false);
                  action.run();
                }}
              />
            ))}
          </ScrollView>
        </Sheet>
      ) : null}
    </>
  );
}
