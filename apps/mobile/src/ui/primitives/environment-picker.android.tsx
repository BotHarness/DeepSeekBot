import { Box, DropdownMenu, DropdownMenuItem, Host, Text } from '@expo/ui/jetpack-compose';
import { fillMaxSize, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
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
        <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
          <DropdownMenu.Trigger>
            <Box modifiers={[fillMaxSize()]} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            {options.map((option) => (
              <DropdownMenuItem
                key={option.value}
                modifiers={[testID(`create-bot-host-${option.value}`)]}
                onClick={() => {
                  setOpen(false);
                  onChange(option.value);
                }}
              >
                <DropdownMenuItem.Text>
                  <Text>{`${option.value === value ? '✓ ' : ''}${option.label}`}</Text>
                </DropdownMenuItem.Text>
              </DropdownMenuItem>
            ))}
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
