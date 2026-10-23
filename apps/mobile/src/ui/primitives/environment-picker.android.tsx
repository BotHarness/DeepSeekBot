import { Box, Column, DropdownMenu, Host } from '@expo/ui/jetpack-compose';
import { fillMaxSize, width } from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { materialMenu } from '../design/tokens';
import { MaterialMenuGroup } from './material-menu.android';
import { MenuIcon } from './menu-icon';
import { Button } from './button';
import type { EnvironmentPickerProps } from './environment-picker';

export function EnvironmentPicker({
  label,
  placeholder,
  value,
  options,
  onChange,
}: EnvironmentPickerProps) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <View>
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <DropdownMenu
          expanded={open}
          onDismissRequest={() => setOpen(false)}
          color="transparent"
          shadowElevation={0}
        >
          <DropdownMenu.Trigger>
            <Box modifiers={[fillMaxSize()]} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            <Column modifiers={[width(materialMenu.width)]}>
              <MaterialMenuGroup
                items={options.map((option) => ({
                  key: option.value,
                  label: option.label,
                  testID: `create-bot-host-${option.value}`,
                  selected: option.value === value,
                  icon: (
                    <MenuIcon
                      icon="computer"
                      color={theme.color.muted}
                      size={materialMenu.iconSize}
                    />
                  ),
                  onPress: () => {
                    setOpen(false);
                    onChange(option.value);
                  },
                }))}
              />
            </Column>
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
      <Button
        label={`${label}: ${selected?.label ?? placeholder}`}
        testID="create-bot-environment"
        onPress={() => setOpen(true)}
      />
    </View>
  );
}
