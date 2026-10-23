import { Box, DropdownMenu, DropdownMenuItem, Host, Text } from '@expo/ui/jetpack-compose';
import { fillMaxSize, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useDesignTheme, pressTint } from '../design/theme';
import { fab } from '../design/tokens';
import { haptic } from '../haptics';
import { t } from '../strings';
import { PlusIcon } from './icons';
import { creationMenuItems, type CreationMenuItem } from './creation-menu-items';
import type { CreationMenuButtonProps } from './creation-menu-button';

export function CreationMenuButton(props: CreationMenuButtonProps) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const [parent, setParent] = useState<CreationMenuItem>();
  const close = () => {
    opened.current = false;
    setOpen(false);
    setParent(undefined);
  };
  return (
    <View style={{ width: props.size, height: props.size }}>
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
            {parent && (
              <DropdownMenuItem
                modifiers={[testID('creation-menu-back')]}
                onClick={() => setParent(undefined)}
              >
                <DropdownMenuItem.Text>
                  <Text>{t.back}</Text>
                </DropdownMenuItem.Text>
              </DropdownMenuItem>
            )}
            {(parent?.children ?? creationMenuItems(props)).map((item) => (
              <DropdownMenuItem
                key={item.key}
                enabled={!props.busy}
                modifiers={[testID(`creation-${item.key}`)]}
                onClick={() => {
                  if (item.children) {
                    setParent(item);
                    return;
                  }
                  close();
                  props.onPick(item.action, item.target);
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
        testID="creation-menu-trigger"
        accessibilityRole="button"
        accessibilityLabel={t.createHere}
        accessibilityState={{ expanded: open, disabled: props.busy }}
        disabled={props.busy}
        onPress={() => {
          if (opened.current) return;
          opened.current = true;
          Keyboard.dismiss();
          haptic('menu');
          setOpen(true);
        }}
        android_ripple={{ color: pressTint(theme.color.fg) }}
        style={{
          width: props.size,
          height: props.size,
          borderRadius: fab.radius,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.layer.canvas.chosen,
          elevation: fab.elevation,
        }}
      >
        <PlusIcon color={theme.color.fg} size={theme.type.title.line} />
      </Pressable>
    </View>
  );
}
