import { Box, DropdownMenu, DropdownMenuItem, Host, Text } from '@expo/ui/jetpack-compose';
import { fillMaxSize, testID as nativeTestID } from '@expo/ui/jetpack-compose/modifiers';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import { haptic } from '../haptics';
import { PlusIcon } from '../shell/icons';
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
        <DropdownMenu expanded={open} onDismissRequest={close}>
          <DropdownMenu.Trigger>
            <Box modifiers={[fillMaxSize()]} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            {items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                enabled={!disabled}
                modifiers={[nativeTestID(item.id)]}
                onClick={() => {
                  if (disabled) return;
                  close();
                  item.run();
                }}
              >
                <DropdownMenuItem.Text>
                  <Text>{item.label}</Text>
                </DropdownMenuItem.Text>
              </DropdownMenuItem>
            ))}
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
