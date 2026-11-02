import { SymbolView } from 'expo-symbols';
import type { SystemSymbolProps } from '../../src/ui/primitives/system-symbol';

export function SystemSymbol({ name, size, color }: SystemSymbolProps) {
  return (
    <SymbolView
      name={
        typeof name === 'object' && name.android !== undefined
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
