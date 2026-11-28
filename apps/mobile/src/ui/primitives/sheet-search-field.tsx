import type { ComponentType } from 'react';
import { Keyboard } from 'react-native';

import { SearchField, type SearchFieldProps } from './search-field';

export type SheetSearchFieldProps = Pick<
  SearchFieldProps,
  'value' | 'placeholder' | 'inset' | 'testID' | 'onChangeText'
>;

export const SheetSearchField: ComponentType<SheetSearchFieldProps> = SearchField;

export function dismissSheetSearchKeyboard() {
  Keyboard.dismiss();
}
