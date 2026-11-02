import { SymbolView } from 'expo-symbols';

import { useDesignTheme } from '../design/theme';
import type { SystemSymbolProps } from './system-symbol';

export function SystemSymbol({ name, size, color }: SystemSymbolProps) {
  const theme = useDesignTheme();
  return (
    <SymbolView
      name={name}
      size={size / theme.fontScale}
      tintColor={color}
      accessible={false}
      importantForAccessibility="no"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    />
  );
}
