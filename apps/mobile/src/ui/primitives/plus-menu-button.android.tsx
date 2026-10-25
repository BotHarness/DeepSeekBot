import { Box, Column, DropdownMenu, Host } from '@expo/ui/jetpack-compose';
import { fillMaxSize, width } from '@expo/ui/jetpack-compose/modifiers';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { pressTint, useDesignTheme } from '../design/theme';
import { materialMenu, radius } from '../design/tokens';
import { haptic } from '../haptics';
import { PlusIcon } from '../shell/icons';
import { MaterialMenuGroup } from './material-menu.android';
import { MenuIcon } from './menu-icon';
import type { PlusMenuButtonProps } from './plus-menu';

export function PlusMenuButton({
  label,
  testID,
  size,
  disabled = false,
  items,
}: PlusMenuButtonProps) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const close = () => {
    opened.current = false;
    setOpen(false);
  };
  return (
    <View style={{ width: size, height: size }}>
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <DropdownMenu
          expanded={open}
          onDismissRequest={close}
          color="transparent"
          shadowElevation={0}
        >
          <DropdownMenu.Trigger>
            <Box modifiers={[fillMaxSize()]} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            <Column modifiers={[width(materialMenu.width)]}>
              <MaterialMenuGroup
                items={items.map((item) => ({
                  key: item.id,
                  label: item.label,
                  testID: item.id,
                  disabled,
                  icon: (
                    <MenuIcon
                      icon={
                        item.symbol === 'photo'
                          ? 'photo'
                          : item.symbol === 'camera'
                            ? 'camera'
                            : 'folder'
                      }
                      color={theme.color.muted}
                      size={materialMenu.iconSize}
                    />
                  ),
                  onPress: () => {
                    if (disabled) return;
                    close();
                    item.run();
                  },
                }))}
              />
            </Column>
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => {
          if (disabled || opened.current) return;
          opened.current = true;
          haptic('menu');
          setOpen(true);
        }}
        android_ripple={{ color: pressTint(theme.color.fg), borderless: false }}
        style={{
          width: size,
          height: size,
          borderRadius: radius.round,
          overflow: 'hidden',
          backgroundColor: theme.layer.raised.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PlusIcon color={theme.color.fg} size={theme.type.title.line} />
      </Pressable>
    </View>
  );
}
