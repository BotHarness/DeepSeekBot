import { Box, Column, DropdownMenu, FilledIconButton, Host, Icon } from '@expo/ui/jetpack-compose';
import {
  defaultMinSize,
  fillMaxSize,
  semantics,
  testID as testTag,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { materialMenu } from '../design/tokens';
import { MaterialMenuGroup } from './material-menu.android';
import { MenuIcon } from './menu-icon';
import type { SheetAddButtonProps } from './sheet-add-button';

export function SheetAddButton({ label, actions, testID }: SheetAddButtonProps) {
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  const press = () => (actions.length === 1 ? actions[0]!.run() : setOpen(true));
  return (
    <View style={{ minWidth: theme.touch, minHeight: theme.touch }}>
      {actions.length === 1 ? null : (
        <Host
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
          ignoreSafeAreaKeyboardInsets
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
                  items={actions.map((action) => ({
                    key: action.label,
                    label: action.label,
                    destructive: false,
                    ...(action.testID === undefined ? {} : { testID: action.testID }),
                    icon: (
                      <MenuIcon
                        icon={action.icon}
                        color={theme.color.fg}
                        size={materialMenu.iconSize}
                      />
                    ),
                    onPress: () => {
                      setOpen(false);
                      action.run();
                    },
                  }))}
                />
              </Column>
            </DropdownMenu.Items>
          </DropdownMenu>
        </Host>
      )}
      <Host matchContents colorScheme={theme.scheme} seedColor={theme.color.accent}>
        <FilledIconButton
          onClick={press}
          colors={{ containerColor: theme.color.accent, contentColor: theme.color.onAccent }}
          modifiers={[
            defaultMinSize({ minWidth: theme.touch, minHeight: theme.touch }),
            semantics({ contentDescription: label }),
            ...(testID === undefined ? [] : [testTag(testID)]),
          ]}
        >
          <Icon source={require('../../../assets/toolbar/add.png')} size={theme.type.title.line} />
        </FilledIconButton>
      </Host>
    </View>
  );
}
