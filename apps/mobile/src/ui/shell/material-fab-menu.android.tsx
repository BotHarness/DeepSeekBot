import type { PrimitiveBaseProps } from '@expo/ui/jetpack-compose';
import { requireNativeView } from 'expo';

export type NativeFabMenuProps = PrimitiveBaseProps & {
  items: { key: string; label: string; path: string }[];
  expanded: boolean;
  direct?: boolean;
  available: boolean;
  label: string;
  closeLabel: string;
  reduceMotion: boolean;
  onToggle(event: { nativeEvent: { expanded: boolean } }): void;
  onPick(event: { nativeEvent: { key: string } }): void;
};

export const NativeFabMenu = requireNativeView<NativeFabMenuProps>(
  'MaterialFabMenu',
  'MaterialFabMenuView',
);
