import { requireNativeView } from 'expo';
import { useState } from 'react';
import { View, useWindowDimensions, type ViewProps } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { materialSearchHeight } from '../design/material-search';
import { useStrings } from '../strings';
import type { SearchFieldProps } from './search-field';

type NativeSearchProps = ViewProps & {
  query: string;
  maxLength: number;
  eventCount: number;
  placeholder: string;
  autoFocus: boolean;
  closable: boolean;
  dark: boolean;
  foreground: string;
  surface: string;
  accent: string;
  closeLabel: string;
  clearLabel: string;
  onQueryChange(event: { nativeEvent: { value: string; eventCount: number } }): void;
  onFocusChange(event: { nativeEvent: { focused: boolean } }): void;
  onClose(): void;
  onSubmit(event: { nativeEvent: { value: string } }): void;
};

const NativeSearch = requireNativeView<NativeSearchProps>('MaterialSearch');

export function SearchField({
  value,
  testID = 'search-input',
  maxLength,
  onSubmitEditing,
  placeholder,
  onChangeText,
  onFocus,
  onBlur,
  onClose,
  autoFocus = false,
  inset,
  floating = false,
  trailing,
}: SearchFieldProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { fontScale } = useWindowDimensions();
  const [eventCount, setEventCount] = useState(0);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: inset,
        marginTop: floating ? 0 : space.x5,
        marginBottom: floating ? 0 : space.x3,
      }}
    >
      <NativeSearch
        testID={testID}
        query={value}
        maxLength={maxLength ?? 0}
        eventCount={eventCount}
        placeholder={placeholder}
        autoFocus={autoFocus}
        closable={onClose !== undefined}
        dark={theme.scheme === 'dark'}
        foreground={theme.color.fg}
        surface={theme.layer.raised.fill}
        accent={theme.color.accent}
        closeLabel={t.closeSearch}
        clearLabel={t.activityClearSearch}
        onQueryChange={({ nativeEvent }: Parameters<NativeSearchProps['onQueryChange']>[0]) => {
          setEventCount(nativeEvent.eventCount);
          onChangeText(nativeEvent.value);
        }}
        onFocusChange={({ nativeEvent }: Parameters<NativeSearchProps['onFocusChange']>[0]) =>
          nativeEvent.focused ? onFocus?.() : onBlur?.()
        }
        onClose={() => onClose?.()}
        onSubmit={({ nativeEvent }: Parameters<NativeSearchProps['onSubmit']>[0]) =>
          onSubmitEditing?.(nativeEvent.value)
        }
        style={{
          flex: 1,
          height: materialSearchHeight(fontScale),
        }}
      />
      {trailing}
    </View>
  );
}
