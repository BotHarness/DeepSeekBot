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
  const searchWithItems = search?.label !== undefined;
  useLayoutEffect(() => {
    if (!searchOpen) return;
    const nextFrame = requestAnimationFrame(() => searchBar.current?.focus());
    return () => cancelAnimationFrame(nextFrame);
  }, [searchOpen]);
  return (
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
        headerSearchBarOptions:
          search && (!searchWithItems || searchOpen)
            ? {
                ref: searchBar,
                placement: searchWithItems ? 'integrated' : 'integratedButton',
                allowToolbarIntegration: false,
                hideWhenScrolling: false,
                obscureBackground: false,
                placeholder: search.placeholder,
                onChangeText: ({ nativeEvent }) => search.onChange(nativeEvent.text),
                onFocus: search.onFocus,
                onBlur: search.onBlur,
                onCancelButtonPress: () => {
                  setSearchOpen(false);
                  search.onCancel();
                },
                onSearchButtonPress: ({ nativeEvent }) => search.onSubmit?.(nativeEvent.text),
              }
            : undefined,
      }}
    />
  );
}
