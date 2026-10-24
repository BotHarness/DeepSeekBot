import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, type ColorValue } from 'react-native';

export type SystemSymbolProps = {
  name: SymbolViewProps['name'];
  size: number;
  color: ColorValue;
};

export function SystemSymbol({ name, size, color }: SystemSymbolProps) {
  return (
    <SymbolView
      name={
        Platform.OS === 'web' && typeof name === 'object' && name.android !== undefined
          ? { ...name, web: name.web ?? name.android }
          : name
      }
      size={size}
      tintColor={color}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
