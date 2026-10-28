import { Box, Column, DropdownMenu, Host } from '@expo/ui/jetpack-compose';
import { fillMaxSize, width } from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { materialMenu, radius, space } from '../design/tokens';
import { MaterialMenuGroup } from './material-menu.android';
import { MenuIcon } from './menu-icon';
import type { ActionMenuButtonProps } from './action-menu-button';
import { MoreIcon } from '../shell/icons';

export type { MenuAction } from './action-menu-button';

export function ActionMenuButton({
  label,
  actions,
  testID = 'action-menu-trigger',
  disabled = false,
}: ActionMenuButtonProps) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  if (disabled && open) setOpen(false);
  return (
    <View style={{ width: theme.touch, height: theme.touch }}>
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <DropdownMenu
          expanded={open && !disabled}
          onDismissRequest={() => setOpen(false)}
          color="transparent"
          shadowElevation={0}
        >
          <DropdownMenu.Trigger>
            <Box modifiers={[fillMaxSize()]} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            <Column
              modifiers={[width(materialMenu.width)]}
              verticalArrangement={{ spacedBy: materialMenu.groupGap }}
            >
              {[false, true].map((destructive) => {
                const group = actions.filter(
                  (action) => (action.destructive === true) === destructive,
                );
                return group.length === 0 ? null : (
                  <MaterialMenuGroup
                    key={String(destructive)}
                    items={group.map((action) => ({
                      key: action.label,
                      label: action.label,
                      destructive,
                      icon: (
                        <MenuIcon
                          icon={action.icon}
                          color={destructive ? theme.color.danger : theme.color.fg}
                          size={materialMenu.iconSize}
                        />
                      ),
                      onPress: () => {
                        setOpen(false);
                        action.run();
                      },
                    }))}
                  />
                );
              })}
            </Column>
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open && !disabled, disabled }}
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
