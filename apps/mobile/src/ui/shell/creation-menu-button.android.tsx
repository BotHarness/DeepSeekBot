import { Box, Column, DropdownMenu, Host } from '@expo/ui/jetpack-compose';
import { fillMaxSize, width } from '@expo/ui/jetpack-compose/modifiers';
import { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useDesignTheme, pressTint } from '../design/theme';
import { fab, materialMenu } from '../design/tokens';
import { haptic } from '../haptics';
import { useStrings } from '../strings';
import { MaterialMenuGroup } from '../primitives/material-menu.android';
import { MenuIcon } from '../primitives/menu-icon';
import { PlusIcon } from './icons';
import { creationMenuItems, type CreationMenuItem } from './creation-menu-items';
import type { CreationMenuButtonProps } from './creation-menu-button';

export function CreationMenuButton(props: CreationMenuButtonProps) {
  const t = useStrings();
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
                items={[
                  ...(parent
                    ? [
                        {
                          key: 'back',
                          label: t.back,
                          testID: 'creation-menu-back',
                          disabled: props.busy,
                          icon: (
                            <MenuIcon
                              icon="back"
                              color={theme.color.muted}
                              size={materialMenu.iconSize}
                            />
                          ),
                          onPress: () => setParent(undefined),
                        },
                      ]
                    : []),
                  ...(
                    parent?.children ?? creationMenuItems({ ...props, nativeChannelForm: true })
                  ).map((item) => ({
                    key: item.key,
                    label: item.label,
                    testID: `creation-${item.key}`,
                    disabled: props.busy,
                    icon: (
                      <MenuIcon
                        icon={
                          parent
                            ? item.target?.kind === 'cloud'
                              ? 'cloud'
                              : 'computer'
                            : item.action
                        }
                        color={theme.color.muted}
                        size={materialMenu.iconSize}
                      />
                    ),
                    onPress: () => {
                      if (props.busy) return;
                      if (item.children) {
                        setParent(item);
                        return;
                      }
                      close();
                      props.onPick(item.action, item.target);
                    },
                  })),
                ]}
              />
            </Column>
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
