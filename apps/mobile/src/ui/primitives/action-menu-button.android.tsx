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
import { Pressable, StyleSheet, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import type { ActionMenuButtonProps } from './action-menu-button';
import { MoreIcon } from '../shell/icons';

export type { MenuAction } from './action-menu-button';

export function ActionMenuButton({ label, actions }: ActionMenuButtonProps) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ width: theme.touch, height: theme.touch }}>
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
              <Fragment key={action.label}>
                {action.destructive === true ? <HorizontalDivider /> : null}
                <DropdownMenuItem
                  {...(action.destructive === true
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
      <Pressable
        testID="action-menu-trigger"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        hitSlop={space.x2}
        android_ripple={{
          borderless: true,
          radius: theme.touch / 2,
          color: theme.layer.sheet.pressed,
        }}
        style={{
          width: theme.touch,
          height: theme.touch,
          borderRadius: radius.round,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MoreIcon color={theme.color.muted} size={theme.type.title.size + space.x2} />
      </Pressable>
    </View>
  );
}
