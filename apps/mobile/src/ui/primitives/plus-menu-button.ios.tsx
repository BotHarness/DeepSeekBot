import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { haptic } from '../haptics';
import { findMenuItem, type PlusMenuButtonProps, type PlusMenuItem } from './plus-menu';

type NativeItem = { id: string; label: string; symbol: string; children: NativeItem[] };
const nativeItem = (item: PlusMenuItem): NativeItem => ({
  id: item.id,
  label: item.label,
  symbol: item.symbol,
  children: (item.children ?? []).map(nativeItem),
});
const NativeMenu = requireNativeView<
  ViewProps & {
    items: NativeItem[];
    label: string;
    identifier: string;
    disabled: boolean;
    embedded: boolean;
    ink: string;
    fill: string;
    iconSize: number;
    scheme: string;
    onOpen(): void;
    onSelect(event: { nativeEvent: { id: string } }): void;
  }
>('NativeMenu');

export function PlusMenuButton({
  label,
  testID,
  size,
  embedded = false,
  disabled = false,
  items,
}: PlusMenuButtonProps) {
  const theme = useDesignTheme();
  return (
    <NativeMenu
      style={{ width: size, height: size }}
      items={items.map(nativeItem)}
      label={label}
      identifier={testID}
      disabled={disabled}
      embedded={embedded}
      ink={theme.color.fg}
      fill={theme.color.surface}
      iconSize={theme.type.title.line}
      scheme={theme.scheme}
      onOpen={() => {
        if (!disabled) haptic('menu');
      }}
      onSelect={({ nativeEvent }) => {
        if (!disabled) findMenuItem(items, nativeEvent.id)?.run();
      }}
    />
  );
}
