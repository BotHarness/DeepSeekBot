import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { haptic } from '../haptics';
import { MenuIcon } from '../primitives/menu-icon';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import type { ChatsCreateButton, ChatsCreateEntry } from './chats-create';
import { HeaderAction } from './header-action';
import { PlusIcon } from './icons';

export type ChatsHeaderActionsProps = {
  search: { label: string; onPress(): void };
  create: ChatsCreateButton | undefined;
};

export function ChatsHeaderActions({ search, create }: ChatsHeaderActionsProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [open, setOpen] = useState(false);
  const row = (entry: ChatsCreateEntry) => (
    <Pressable
      key={entry.id}
      testID={`chats-create-${entry.id}`}
      accessibilityRole="menuitem"
      accessibilityLabel={entry.label}
      disabled={create?.disabled}
      onPress={() => {
        setOpen(false);
        entry.run();
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3, padding: space.x3 }}
    >
      <MenuIcon
        icon={entry.glyph}
        color={theme.color.fg}
        size={theme.type.body.line * theme.fontScale}
      />
      <Text>{entry.label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <HeaderAction
        icon="search"
        label={search.label}
        testID="search-button"
        onPress={search.onPress}
      />
      {create === undefined ? null : (
        <>
          <Pressable
            testID="chats-create-button"
            accessibilityRole="button"
            accessibilityLabel={create.label}
            accessibilityState={{ disabled: create.disabled, expanded: open }}
            disabled={create.disabled}
            onPress={() => {
              haptic('menu');
              setOpen(true);
            }}
            style={({ pressed }) => ({
              width: theme.touch,
              height: theme.touch,
              borderRadius: radius.round,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <PlusIcon color={theme.color.fg} size={theme.type.title.size} />
          </Pressable>
          {open ? (
            <Modal visible transparent onRequestClose={() => setOpen(false)}>
              <View
                testID="chats-create-menu"
                style={{ padding: space.x5, backgroundColor: theme.overlay.fill }}
              >
                {create.bot ? (
                  <View accessibilityRole="menu" accessibilityLabel={create.bot.label}>
                    <Text>{create.bot.label}</Text>
                    {create.bot.sources.map(row)}
                  </View>
                ) : null}
                {create.actions.map(row)}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.close}
                  onPress={() => setOpen(false)}
                >
                  <Text>{t.close}</Text>
                </Pressable>
              </View>
            </Modal>
          ) : null}
        </>
      )}
    </View>
  );
}
