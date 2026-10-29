import { Host, type PrimitiveBaseProps } from '@expo/ui/jetpack-compose';
import { testID as testTag } from '@expo/ui/jetpack-compose/modifiers';
import { requireNativeView } from 'expo';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { materialSearchHeight } from '../design/material-search';
import { useStrings } from '../strings';
import type { SearchFieldProps } from './search-field';

type NativeSearchProps = PrimitiveBaseProps & {
  query: string;
  maxLength: number;
  eventCount: number;
  placeholder: string;
  autoFocus: boolean;
  closable: boolean;
  closeLabel: string;
  clearLabel: string;
  onQueryChange(event: { nativeEvent: { value: string; eventCount: number } }): void;
  onFocusChange(event: { nativeEvent: { focused: boolean } }): void;
  onClose(): void;
  onSubmit(event: { nativeEvent: { value: string } }): void;
};

const NativeSearch = requireNativeView<NativeSearchProps>('MaterialSearch', 'MaterialSearchView');

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
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        style={{
          flex: 1,
          height: materialSearchHeight(fontScale),
        }}
      >
        <NativeSearch
          modifiers={[testTag(testID)]}
          query={value}
          maxLength={maxLength ?? 0}
          eventCount={eventCount}
          placeholder={placeholder}
          autoFocus={autoFocus}
          closable={onClose !== undefined}
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
        />
      </Host>
      {trailing}
    </View>
  );
}
