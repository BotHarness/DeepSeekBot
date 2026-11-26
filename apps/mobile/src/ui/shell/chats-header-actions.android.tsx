import {
  Column,
  DropdownMenu,
  Host,
  Icon,
  SplitButtonLayout,
  SplitButtonLeadingButton,
  SplitButtonTrailingButton,
} from '@expo/ui/jetpack-compose';
import { semantics, testID, width } from '@expo/ui/jetpack-compose/modifiers';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { materialIconButton, materialMenu } from '../design/tokens';
import { haptic } from '../haptics';
import { MaterialMenuGroup } from '../primitives/material-menu.android';
import { MenuIcon } from '../primitives/menu-icon';
import type { ChatsCreateEntry } from './chats-create';
import type { ChatsHeaderActionsProps } from './chats-header-actions';
import { HeaderAction } from './header-action';

const searchIcon = require('../../../assets/header/search.xml');
const addIcon = require('../../../assets/header/add.xml');

export function ChatsHeaderActions({ search, create }: ChatsHeaderActionsProps) {
  const theme = useDesignTheme();
  const roles = useMaterialRoles();
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  if (create === undefined)
    return (
      <HeaderAction
        icon="search"
        label={search.label}
        testID="search-button"
        onPress={search.onPress}
      />
    );
  const colors = {
    containerColor: roles.secondaryContainer,
    contentColor: roles.onSecondaryContainer,
  };
  const close = () => {
    opened.current = false;
    setOpen(false);
  };
  const row = (entry: ChatsCreateEntry) => ({
    key: entry.id,
    label: entry.label,
    testID: `chats-create-${entry.id}`,
    disabled: create.disabled,
    icon: <MenuIcon icon={entry.glyph} color={theme.color.fg} size={materialMenu.iconSize} />,
    onPress: () => {
      close();
      entry.run();
    },
  });
  return (
    <View
      collapsable={false}
      style={{ minHeight: materialIconButton.target, justifyContent: 'center' }}
    >
      <Host colorScheme={theme.scheme} seedColor={theme.color.accent} matchContents>
        <SplitButtonLayout>
          <SplitButtonLayout.LeadingButton>
            <SplitButtonLeadingButton
              colors={colors}
              onClick={search.onPress}
              modifiers={[semantics({ contentDescription: search.label }), testID('search-button')]}
            >
              <Icon source={searchIcon} size={materialIconButton.iconSize} />
            </SplitButtonLeadingButton>
          </SplitButtonLayout.LeadingButton>
          <SplitButtonLayout.TrailingButton>
            <DropdownMenu
              expanded={open && !create.disabled}
              onDismissRequest={close}
              color="transparent"
              shadowElevation={0}
            >
              <DropdownMenu.Trigger>
                <SplitButtonTrailingButton
                  checked={open}
                  enabled={!create.disabled}
                  colors={colors}
                  onCheckedChange={() => {
                    if (opened.current) return close();
                    opened.current = true;
                    haptic('menu');
                    setOpen(true);
                  }}
                  modifiers={[
                    semantics({ contentDescription: create.label }),
                    testID('chats-create-button'),
                  ]}
                >
                  <Icon source={addIcon} size={materialIconButton.iconSize} />
                </SplitButtonTrailingButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Items>
                <Column
                  modifiers={[width(materialMenu.width)]}
                  verticalArrangement={{ spacedBy: materialMenu.groupGap }}
                >
                  {create.bot ? (
                    <MaterialMenuGroup
                      header={create.bot.label}
                      items={create.bot.sources.map(row)}
                    />
                  ) : null}
                  {create.actions.length > 0 ? (
                    <MaterialMenuGroup items={create.actions.map(row)} />
                  ) : null}
                </Column>
              </DropdownMenu.Items>
            </DropdownMenu>
          </SplitButtonLayout.TrailingButton>
        </SplitButtonLayout>
      </Host>
    </View>
  );
}
