import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

export type SystemSymbolProps = {
  name: SymbolViewProps['name'];
  size: number;
  color: ColorValue;
};

export function SystemSymbol({ name, size, color }: SystemSymbolProps) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
