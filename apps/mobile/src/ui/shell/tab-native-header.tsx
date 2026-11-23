import { Stack, type NativeStackHeaderItem } from 'expo-router';
import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { SearchBarCommands } from 'react-native-screens';
import { useDesignTheme } from '../design/theme';

export type TabHeaderSearch = {
  placeholder: string;
  label?: string;
  onChange(text: string): void;
  onFocus?(): void;
  onBlur?(): void;
  onCancel(): void;
  onSubmit?(text: string): void;
};

export function TabNativeHeader({
  title,
  leading,
  search,
  items,
}: {
  title: string;
  leading: ReactElement | null;
  search?: TabHeaderSearch | undefined;
  items?: NativeStackHeaderItem[] | undefined;
}) {
  const theme = useDesignTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBar = useRef<SearchBarCommands>(null);
  const focusReceived = useRef(false);
  const searchWithItems = search?.label !== undefined;
  useLayoutEffect(() => {
    if (!searchOpen) return;
    focusReceived.current = false;
    const attempts = [0, 80, 240, 480].map((delay) =>
      setTimeout(() => {
        if (!focusReceived.current) searchBar.current?.focus();
      }, delay),
    );
    return () => attempts.forEach(clearTimeout);
  }, [searchOpen]);
  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerTitle: '',
          headerShown: true,
          headerBackVisible: false,
          headerLargeTitleEnabled: false,
          headerTransparent: false,
          headerStyle: {},
          headerLargeStyle: {},
          headerUserInterfaceStyle: theme.scheme,
          unstable_headerLeftItems: () =>
            leading == null || searchOpen
              ? []
              : [{ type: 'custom', element: leading, hidesSharedBackground: true }],
          unstable_headerRightItems: () =>
            searchOpen || !search?.label
              ? []
              : [
                  {
                    type: 'button',
                    label: search.label,
                    identifier: 'tab-search',
                    icon: { type: 'sfSymbol', name: 'magnifyingglass' },
                    sharesBackground: true,
                    onPress: () => setSearchOpen(true),
                  },
                  ...(items ?? []),
                ],
        }}
      />
      {search && (!searchWithItems || searchOpen) ? (
        <Stack.SearchBar
          ref={searchBar}
          placement={searchWithItems ? 'integrated' : 'integratedButton'}
          allowToolbarIntegration={false}
          hideWhenScrolling={false}
          obscureBackground={false}
          placeholder={search.placeholder}
          onChangeText={({ nativeEvent }) => search.onChange(nativeEvent.text)}
          onFocus={() => {
            focusReceived.current = true;
            search.onFocus?.();
          }}
          onBlur={search.onBlur}
          onCancelButtonPress={() => {
            setSearchOpen(false);
            search.onCancel();
          }}
          onSearchButtonPress={({ nativeEvent }) => search.onSubmit?.(nativeEvent.text)}
        />
      ) : null}
    </>
  );
}
