import { createContext, useContext, type ComponentType } from 'react';
import type { ScrollViewProps } from 'react-native';

export type SettingsScroll = ScrollViewProps['onScroll'];

export const SettingsScrollContext = createContext<
  | { onScroll: SettingsScroll; headerInset: number; ScrollView: ComponentType<ScrollViewProps> }
  | undefined
>(undefined);

export function useSettingsScroll() {
  return useContext(SettingsScrollContext);
}
