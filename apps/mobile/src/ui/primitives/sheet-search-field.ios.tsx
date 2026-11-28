import { requireNativeView } from 'expo';
import { useState } from 'react';
import type { ViewProps } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import type { SheetSearchFieldProps } from './sheet-search-field';

type Query = { value: string; eventCount: number };
type NativeSearchProps = ViewProps & {
  query: Query;
  placeholder: string;
  inputID: string;
  scheme: 'light' | 'dark';
  onQueryChange(event: { nativeEvent: Query }): void;
};

const NativeSearch = requireNativeView<NativeSearchProps>('SheetSearch');

export function SheetSearchField({
  value,
  placeholder,
  inset,
  testID = 'search-input',
  onChangeText,
}: SheetSearchFieldProps) {
  const theme = useDesignTheme();
  const [eventCount, setEventCount] = useState(0);
  return (
    <NativeSearch
      query={{ value, eventCount }}
      placeholder={placeholder}
      inputID={testID}
      scheme={theme.scheme}
      onQueryChange={({ nativeEvent }) => {
        setEventCount(nativeEvent.eventCount);
        onChangeText(nativeEvent.value);
      }}
      style={{
        height: theme.touch + theme.type.body.line * Math.max(0, theme.fontScale - 1),
        marginHorizontal: inset,
        marginTop: space.x5,
        marginBottom: space.x3,
      }}
    />
  );
}

export function dismissSheetSearchKeyboard() {
  void KeyboardController.dismiss();
}
