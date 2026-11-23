import {
  Stack,
  useFocusEffect,
  type NativeStackHeaderItem,
  type NativeStackNavigationOptions,
} from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { SearchBarCommands, SearchBarProps } from 'react-native-screens';
import { useDesignTheme } from '../design/theme';

export type TabHeaderSearch = {
  placeholder: string;
  label?: string;
  value?: string;
  onChange(text: string): void;
  onFocus?(): void;
  onBlur?(): void;
  onCancel(): void;
  onSubmit?(text: string): void;
};

type TabHeaderOptions = Omit<NativeStackNavigationOptions, 'headerSearchBarOptions'> & {
  headerSearchBarOptions: SearchBarProps | undefined;
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
  useFocusEffect(useCallback(() => () => setSearchOpen(false), []));
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

  const options: TabHeaderOptions = {
    title,
    headerTitle: '',
    headerShown: true,
    headerBackVisible: false,
    headerLargeTitleEnabled: false,
    headerTransparent: false,
    headerStyle: { backgroundColor: theme.color.base },
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
            onFocus: () => {
              if (!focusReceived.current && search.value) searchBar.current?.setText(search.value);
              focusReceived.current = true;
              search.onFocus?.();
            },
            onBlur: () => {
              if (searchWithItems && focusReceived.current) setSearchOpen(false);
              search.onBlur?.();
            },
            onCancelButtonPress: () => {
              setSearchOpen(false);
              search.onCancel();
            },
            onSearchButtonPress: ({ nativeEvent }) => search.onSubmit?.(nativeEvent.text),
          }
        : undefined,
  };
  return <Stack.Screen options={options as NativeStackNavigationOptions} />;
}
