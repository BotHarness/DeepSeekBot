import { Pressable, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import type { ChatsCreateButton } from './chats-create';
import { HeaderAction } from './header-action';
import { PlusIcon } from './icons';

export type ChatsHeaderActionsProps = {
  search: { label: string; onPress(): void };
  create: ChatsCreateButton | undefined;
};

export function ChatsHeaderActions({ search, create }: ChatsHeaderActionsProps) {
  const theme = useDesignTheme();
  const unavailable = create !== undefined && (create.disabled || create.expanded);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <HeaderAction
        icon="search"
        label={search.label}
        testID="search-button"
        onPress={search.onPress}
      />
      {create === undefined ? null : (
        <Pressable
          ref={create.triggerRef}
          testID="chats-create-button"
          accessibilityRole="button"
          accessibilityLabel={create.label}
          accessibilityState={{ disabled: unavailable, expanded: create.expanded }}
          disabled={unavailable}
          onPress={create.onPress}
          style={({ pressed }) => ({
            width: theme.touch,
            height: theme.touch,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: create.expanded ? 0 : pressed ? 0.7 : 1,
          })}
        >
          <PlusIcon color={theme.color.fg} size={theme.type.title.size} />
        </Pressable>
      )}
    </View>
  );
}
