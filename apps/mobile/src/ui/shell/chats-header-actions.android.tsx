import {
  Host,
  Icon,
  SplitButtonLayout,
  SplitButtonLeadingButton,
  SplitButtonTrailingButton,
} from '@expo/ui/jetpack-compose';
import { semantics, testID } from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';

import { useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { materialIconButton } from '../design/tokens';
import type { ChatsHeaderActionsProps } from './chats-header-actions';
import { HeaderAction } from './header-action';

const searchIcon = require('../../../assets/header/search.xml');
const addIcon = require('../../../assets/header/add.xml');

export function ChatsHeaderActions({ search, create }: ChatsHeaderActionsProps) {
  const theme = useDesignTheme();
  const roles = useMaterialRoles();
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
  const unavailable = create.disabled || create.expanded;
  return (
    <View
      ref={create.triggerRef}
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
            <SplitButtonTrailingButton
              checked={create.expanded}
              enabled={!unavailable}
              colors={colors}
              onCheckedChange={() => create.onPress()}
              modifiers={[
                semantics({ contentDescription: create.label }),
                testID('chats-create-button'),
              ]}
            >
              <Icon source={addIcon} size={materialIconButton.iconSize} />
            </SplitButtonTrailingButton>
          </SplitButtonLayout.TrailingButton>
        </SplitButtonLayout>
      </Host>
    </View>
  );
}
