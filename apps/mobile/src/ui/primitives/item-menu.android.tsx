import {
  Box,
  DropdownMenu,
  DropdownMenuItem,
  HorizontalDivider,
  Host,
  Text,
} from '@expo/ui/jetpack-compose';
import { fillMaxSize } from '@expo/ui/jetpack-compose/modifiers';
import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import type { ItemMenuProps } from './item-menu';
export type { ItemMenuAction } from './item-menu';

export function ItemMenu({ actions, children }: ItemMenuProps) {
  const [open, setOpen] = useState(false);
  const theme = useDesignTheme();
  return (
    <View>
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
          <DropdownMenu.Trigger>
            <Box modifiers={[fillMaxSize()]} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            {actions.map((action) => (
              <Fragment key={action.key}>
                {action.destructive ? <HorizontalDivider /> : null}
                <DropdownMenuItem
                  {...(action.destructive
                    ? { elementColors: { textColor: theme.color.danger } }
                    : {})}
                  onClick={() => {
                    setOpen(false);
                    action.run();
                  }}
                >
                  <DropdownMenuItem.Text>
                    <Text>{action.label}</Text>
                  </DropdownMenuItem.Text>
                </DropdownMenuItem>
              </Fragment>
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
      {children(() => setOpen(true))}
    </View>
  );
}
