import { Box, Column, DropdownMenu, Host } from '@expo/ui/jetpack-compose';
import { fillMaxSize, width } from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { materialMenu } from '../design/tokens';
import { MaterialMenuGroup } from './material-menu.android';
import { SettingsRow } from './settings-row';
import { RowIcon } from './row-icon';
import { CheckIcon } from '../shell/icons';
import type { PreferenceRowProps } from './preference-row';

export function PreferenceRow<T extends string>({
  title,
  icon,
  on = 'sheet',
  testID,
  value,
  options,
  onChange,
}: PreferenceRowProps<T>) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
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
                  selected: option.value === value,
                  testID: `${testID}-${option.value}`,
                  icon: (
                    <CheckIcon
                      color={option.value === value ? theme.color.accent : 'transparent'}
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
      <SettingsRow
        on={on}
        title={title}
        leading={<RowIcon name={icon} />}
        detail={options.find((option) => option.value === value)?.label ?? value}
        testID={testID}
        expanded={open}
        onPress={() => setOpen(true)}
      />
    </View>
  );
}
